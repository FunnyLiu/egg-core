'use strict';

const is = require('is-type-of');
const path = require('path');

const LOAD_BOOT_HOOK = Symbol('Loader#loadBootHook');

module.exports = {

  /**
   * load app.js
   *
   * @example
   * - old:
   *
   * ```js
   * module.exports = function(app) {
   *   doSomething();
   * }
   * ```
   *
   * - new:
   *
   * ```js
   * module.exports = class Boot {
   *   constructor(app) {
   *     this.app = app;
   *   }
   *   configDidLoad() {
   *     doSomething();
   *   }
   * }
   * @since 1.0.0
   */
  // egg的app_worker_loader.js会去调用该方法
  loadCustomApp() {
    this[LOAD_BOOT_HOOK]('app');
    // 触发生命周期中的配置文件load
    this.lifecycle.triggerConfigWillLoad();
  },

  /**
   * Load agent.js, same as {@link EggLoader#loadCustomApp}
   */
  loadCustomAgent() {
    // 初始化所有生命周期方法
    this[LOAD_BOOT_HOOK]('agent');
    // 触发生命周期中的配置文件load
    this.lifecycle.triggerConfigWillLoad();
  },

  // FIXME: no logger used after egg removed
  loadBootHook() {
    // do nothing
  },
  // 解析app.js或agent.js，也就是生命周期文件。兼容class和function模式
  [LOAD_BOOT_HOOK](fileName) {
    this.timing.start(`Load ${fileName}.js`);
    for (const unit of this.getLoadUnits()) {
      const bootFilePath = this.resolveModule(path.join(unit.path, fileName));
      if (!bootFilePath) {
        continue;
      }
      const bootHook = this.requireFile(bootFilePath);
      // 使用class风格的app.js
      if (is.class(bootHook)) {
        bootHook.prototype.fullPath = bootFilePath;
        // if is boot class, add to lifecycle
        this.lifecycle.addBootHook(bootHook);
      } else if (is.function(bootHook)) {
        // 兼容函数风格的app.js
        // if is boot function, wrap to class
        // for compatibility
        this.lifecycle.addFunctionAsBootHook(bootHook);
      } else {
        this.options.logger.warn('[egg-loader] %s must exports a boot class', bootFilePath);
      }
    }
    // init boots
    // 初始化生命周期钩子
    this.lifecycle.init();
    this.timing.end(`Load ${fileName}.js`);
  },
};
