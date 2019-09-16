# 源码分析

## 文件结构

``` bash
├── index.d.ts - 声明文件
├── index.js - 入口文件
├── lib
|  ├── egg.js
|  ├── lifecycle.js
|  ├── loader
|  |  ├── context_loader.js
|  |  ├── egg_loader.js
|  |  ├── file_loader.js
|  |  └── mixin
|  |     ├── config.js
|  |     ├── controller.js
|  |     ├── custom.js
|  |     ├── custom_loader.js
|  |     ├── extend.js
|  |     ├── middleware.js
|  |     ├── plugin.js
|  |     ├── router.js
|  |     └── service.js
|  └── utils
|     ├── base_context_class.js
|     ├── index.js
|     ├── sequencify.js
|     └── timing.js
```

## 外部模块依赖

![img](./graphviz/egg_core.svg)

## 内部模块依赖

![img](./graphviz/egg_core_inline.gv.svg)

