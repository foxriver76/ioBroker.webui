const importMapRuntime = {
    "imports": {
        "@node-projects/web-component-designer": "./node_modules/@node-projects/web-component-designer/dist/index.js",
        "@node-projects/web-component-designer/": "./node_modules/@node-projects/web-component-designer/",
        "@node-projects/base-custom-webcomponent/": "./node_modules/@node-projects/base-custom-webcomponent/",
        "@node-projects/base-custom-webcomponent": "./node_modules/@node-projects/base-custom-webcomponent/dist/index.js",
        "@iobroker/socket-client/": "./node_modules/@iobroker/socket-client/",
        "@iobroker/socket-client": "./node_modules/@iobroker/socket-client/dist/esm/index.js",
        "tslib": "./node_modules/tslib/tslib.es6.mjs",
        "long": "./node_modules/long/index.js"
    }
}
//@ts-ignore
importShim.addImportMap(importMapRuntime);