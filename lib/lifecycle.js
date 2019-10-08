'use strict';

const is = require('is-type-of');
const assert = require('assert');
const getReady = require('get-ready');
const { Ready } = require('ready-callback');
const { EventEmitter } = require('events');
const debug = require('debug')('egg-core:lifecycle');
const INIT = Symbol('Lifycycle#init');
const INIT_READY = Symbol('Lifecycle#initReady');
const DELEGATE_READY_EVENT = Symbol('Lifecycle#delegateReadyEvent');
const REGISTER_BEFORE_CLOSE = Symbol('Lifecycle#registerBeforeClose');
const REGISTER_READY_CALLBACK = Symbol('Lifecycle#registerReadyCallback');
const CLOSE_SET = Symbol('Lifecycle#closeSet');
const IS_CLOSED = Symbol('Lifecycle#isClosed');
const BOOT_HOOKS = Symbol('Lifecycle#bootHooks');
const BOOTS = Symbol('Lifecycle#boots');

const utils = require('./utils');
// 继承自原生events模块的EventEmitter
class Lifecycle extends EventEmitter {

  /**
   * @param {object} options - options
   * @param {String} options.baseDir - the directory of application
   * @param {EggCore} options.app - Application instance
   * @param {Logger} options.logger - logger
   */
  constructor(options) {
    super();
    this.options = options;
    this[BOOT_HOOKS] = [];
    this[BOOTS] = [];
    this[CLOSE_SET] = new Set();
    this[IS_CLOSED] = false;
    this[INIT] = false;
    getReady.mixin(this);
    // 开始
    this.timing.start('Application Start');
    // get app timeout from env or use default timeout 10 second
    const eggReadyTimeoutEnv = Number.parseInt(process.env.EGG_READY_TIMEOUT_ENV || 10000);
    // 判断数据类型
    assert(
      Number.isInteger(eggReadyTimeoutEnv),
      `process.env.EGG_READY_TIMEOUT_ENV ${process.env.EGG_READY_TIMEOUT_ENV} should be able to parseInt.`);
    this.readyTimeout = eggReadyTimeoutEnv;

    this[INIT_READY]();
    this
      .on('ready_stat', data => {
        this.logger.info('[egg:core:ready_stat] end ready task %s, remain %j', data.id, data.remain);
      })
      .on('ready_timeout', id => {
        this.logger.warn('[egg:core:ready_timeout] %s seconds later %s was still unable to finish.', this.readyTimeout / 1000, id);
      });
    // 结束计时
    this.ready(err => {
      // 触发didready
      this.triggerDidReady(err);
      this.timing.end('Application Start');
    });
  }
  // app来自外部参数
  get app() {
    return this.options.app;
  }
  // logger来自外部参数
  get logger() {
    return this.options.logger;
  }
  // timing来自外部参数
  get timing() {
    return this.app.timing;
  }

  legacyReadyCallback(name, opt) {
    return this.loadReady.readyCallback(name, opt);
  }
  // 给BOOT_HOOKS中增加值
  // hook为class风格
  addBootHook(hook) {
    assert(this[INIT] === false, 'do not add hook when lifecycle has been initialized');
    this[BOOT_HOOKS].push(hook);
  }
  // 给BOOT_HOOKS中增加值
  // hook为函数风格风格
  addFunctionAsBootHook(hook) {
    assert(this[INIT] === false, 'do not add hook when lifecycle has been initialized');
    // app.js is exported as a function
    // call this function in configDidLoad
    // 手动套一个class来兼容
    this[BOOT_HOOKS].push(class Hook {
      constructor(app) {
        this.app = app;
      }
      configDidLoad() {
        hook(this.app);
      }
    });
  }

  /**
   * init boots and trigger config did config
   */
  // 初始化生命周期，在custom.js中被调用
  init() {
    assert(this[INIT] === false, 'lifecycle have been init');
    this[INIT] = true;
    // 给BOOTS中赋值
    this[BOOTS] = this[BOOT_HOOKS].map(t => new t(this.app));
    // 注册beforeClose方法
    this[REGISTER_BEFORE_CLOSE]();
  }
  // 注册开始前函数
  registerBeforeStart(scope) {
    this[REGISTER_READY_CALLBACK]({
      scope,
      ready: this.loadReady,
      timingKeyPrefix: 'Before Start',
    });
  }
  // 注册结束前函数
  // 生命周期之beforeClose
  registerBeforeClose(fn) {

    assert(is.function(fn), 'argument should be function');
    assert(this[IS_CLOSED] === false, 'app has been closed');
    this[CLOSE_SET].add(fn);
  }
  // 结束
  async close() {
    // 逐个调用beforeClose生命周期的方法
    // close in reverse order: first created, last closed
    const closeFns = Array.from(this[CLOSE_SET]);
    // 逐个调用结束前函数钩子
    for (const fn of closeFns.reverse()) {
      await utils.callFn(fn);
      this[CLOSE_SET].delete(fn);
    }
    // Be called after other close callbacks
    this.app.emit('close');
    this.removeAllListeners();
    this.app.removeAllListeners();
    this[IS_CLOSED] = true;
  }
  // 触发生命周期各阶段函数
  // 触发生命周期之configWillLoad
  triggerConfigWillLoad() {
    for (const boot of this[BOOTS]) {
      if (boot.configWillLoad) {
        boot.configWillLoad();
      }
    }
    this.triggerConfigDidLoad();
  }
  // 触发生命周期之configDidLoad
  triggerConfigDidLoad() {
    for (const boot of this[BOOTS]) {
      if (boot.configDidLoad) {
        boot.configDidLoad();
      }
    }
    this.triggerDidLoad();
  }
  // 触发生命周期之didLoad
  triggerDidLoad() {
    debug('register didLoad');
    for (const boot of this[BOOTS]) {
      const didLoad = boot.didLoad && boot.didLoad.bind(boot);
      if (didLoad) {
        this[REGISTER_READY_CALLBACK]({
          scope: didLoad,
          ready: this.loadReady,
          timingKeyPrefix: 'Did Load',
          scopeFullName: boot.fullPath + ':didLoad',
        });
      }
    }
  }
  // 触发生命周期之willReady
  triggerWillReady() {
    debug('register willReady');
    // 开启bootready
    this.bootReady.start();
    for (const boot of this[BOOTS]) {
      const willReady = boot.willReady && boot.willReady.bind(boot);
      if (willReady) {
        // 执行willReady
        this[REGISTER_READY_CALLBACK]({
          scope: willReady,
          ready: this.bootReady,
          timingKeyPrefix: 'Will Ready',
          scopeFullName: boot.fullPath + ':willReady',
        });
      }
    }
  }
  // 触发生命周期之didReady
  triggerDidReady(err) {
    debug('trigger didReady');
    (async () => {
      for (const boot of this[BOOTS]) {
        if (boot.didReady) {
          try {
            await boot.didReady(err);
          } catch (e) {
            this.emit('error', e);
          }
        }
      }
      debug('trigger didReady done');
    })();
  }
  // 触发生命周期之serverDidReady，
  // 在egg的egg.js中通过事件监听egg-ready后调用
  triggerServerDidReady() {
    (async () => {
      for (const boot of this[BOOTS]) {
        try {
          await utils.callFn(boot.serverDidReady, null, boot);
        } catch (e) {
          this.emit('error', e);
        }
      }
    })();
  }
  // 初始化
  [INIT_READY]() {
    this.loadReady = new Ready({ timeout: this.readyTimeout });
    // 代理事件到本体
    this[DELEGATE_READY_EVENT](this.loadReady);
    this.loadReady.ready(err => {
      debug('didLoad done');
      if (err) {
        this.ready(err);
      } else {
        // 如果ready，触发
        this.triggerWillReady();
      }
    });

    this.bootReady = new Ready({ timeout: this.readyTimeout, lazyStart: true });
    this[DELEGATE_READY_EVENT](this.bootReady);
    this.bootReady.ready(err => {
      // 完成后再执行ready
      this.ready(err || true);
    });
  }
  // 代理事件
  [DELEGATE_READY_EVENT](ready) {
    ready.once('error', err => ready.ready(err));
    ready.on('ready_timeout', id => this.emit('ready_timeout', id));
    ready.on('ready_stat', data => this.emit('ready_stat', data));
    ready.on('error', err => this.emit('error', err));
  }

  [REGISTER_BEFORE_CLOSE]() {
    for (const boot of this[BOOTS]) {
      const beforeClose = boot.beforeClose && boot.beforeClose.bind(boot);
      if (beforeClose) {
        this.registerBeforeClose(beforeClose);
      }
    }
  }
  // ready的回调
  [REGISTER_READY_CALLBACK]({ scope, ready, timingKeyPrefix, scopeFullName }) {
    if (!is.function(scope)) {
      throw new Error('boot only support function');
    }

    // get filename from stack if scopeFullName is undefined
    const name = scopeFullName || utils.getCalleeFromStack(true, 4);
    const timingkey = `${timingKeyPrefix} in ` + utils.getResolvedFilename(name, this.app.baseDir);

    this.timing.start(timingkey);

    const done = ready.readyCallback(name);

    // ensure scope executes after load completed
    process.nextTick(() => {
      utils.callFn(scope).then(() => {
        done();
        this.timing.end(timingkey);
      }, err => {
        done(err);
        this.timing.end(timingkey);
      });
    });
  }
}

module.exports = Lifecycle;
