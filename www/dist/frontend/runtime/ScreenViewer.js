var ScreenViewer_1;
import { __decorate } from "tslib";
import { BaseCustomWebComponentConstructorAppend, css, cssFromString, customElement, DomHelper, property } from "@node-projects/base-custom-webcomponent";
import { iobrokerHandler } from "../common/IobrokerHandler.js";
import { convertCssUnitToPixel } from "@node-projects/web-component-designer/dist/elements/helper/CssUnitConverter.js";
let ScreenViewer = class ScreenViewer extends BaseCustomWebComponentConstructorAppend {
    static { ScreenViewer_1 = this; }
    static style = css `
    :host {
        height: 100%;
        position: relative;
        display: block;
    }

    *[node-projects-hide-at-run-time] {
        display: none !important;
    }
    `;
    _iobBindings;
    _loading;
    _refreshViewSubscription;
    _screenName;
    _screensChangedSubscription;
    _scriptObject;
    _resizeObserver;
    #eventListeners = [];
    get screenName() {
        return this._screenName;
    }
    set screenName(value) {
        if (this._screenName != value) {
            this._screenName = value;
            this._loadScreen();
        }
    }
    _relativeSignalsPath;
    get relativeSignalsPath() {
        return this._relativeSignalsPath;
    }
    set relativeSignalsPath(value) {
        if (this._relativeSignalsPath != value) {
            this._relativeSignalsPath = value;
        }
    }
    objects;
    constructor() {
        super();
        this._restoreCachedInititalValues();
    }
    ready() {
        this._parseAttributesToProperties();
        if (this._screenName)
            this._loadScreen();
    }
    removeBindings() {
        if (this._iobBindings)
            this._iobBindings.forEach(x => x());
        this._iobBindings = null;
    }
    async _loadScreen() {
        if (!this._loading) {
            this._loading = true;
            await iobrokerHandler.waitForReady();
            this._loading = false;
            this.removeBindings();
            DomHelper.removeAllChildnodes(this.shadowRoot);
            const screen = await iobrokerHandler.getWebuiObject('screen', this.screenName);
            if (screen) {
                this.loadScreenData(screen.html, screen.style, screen.script, screen.settings);
            }
        }
    }
    async loadScreenData(html, style, script, settings) {
        let globalStyle = iobrokerHandler.config?.globalStyle ?? '';
        if (globalStyle && style)
            this.shadowRoot.adoptedStyleSheets = [ScreenViewer_1.style, iobrokerHandler.globalStylesheet, cssFromString(style)];
        else if (globalStyle)
            this.shadowRoot.adoptedStyleSheets = [ScreenViewer_1.style, iobrokerHandler.globalStylesheet];
        else if (style)
            this.shadowRoot.adoptedStyleSheets = [ScreenViewer_1.style, cssFromString(style)];
        else
            this.shadowRoot.adoptedStyleSheets = [ScreenViewer_1.style];
        //@ts-ignore
        const myDocument = new DOMParser().parseFromString(html, 'text/html', { includeShadowRoots: true });
        const fragment = document.createDocumentFragment();
        for (const n of myDocument.head.childNodes)
            fragment.appendChild(n);
        for (const n of myDocument.body.childNodes)
            fragment.appendChild(n);
        this.shadowRoot.appendChild(fragment);
        this._iobBindings = window.appShell.bindingsHelper.applyAllBindings(this.shadowRoot, this.relativeSignalsPath, this);
        this._scriptObject = await window.appShell.scriptSystem.assignAllScripts('screenviewer - ' + this.screenName, script, this.shadowRoot, this);
        if (settings?.stretch && settings?.stretch !== 'none') {
            this._stretchView(settings);
        }
    }
    _stretchView(settings) {
        const width = convertCssUnitToPixel(settings.width, this, 'width');
        const height = convertCssUnitToPixel(settings.height, this, 'height');
        let scaleX = this.offsetWidth / width;
        let scaleY = this.offsetHeight / height;
        let translateX = 0;
        let translateY = 0;
        if (settings.stretch == 'uniform') {
            if (scaleX > scaleY) {
                scaleX = scaleY;
                translateX = (this.offsetWidth - width) / (2 * scaleX);
            }
            else {
                scaleY = scaleX;
                translateY = (this.offsetHeight - height) / (2 * scaleY);
            }
        }
        else if (settings.stretch == 'uniformToFill') {
            if (scaleX > scaleY) {
                scaleY = scaleX;
                translateY = (this.offsetHeight - height) / (2 * scaleY);
            }
            else {
                scaleX = scaleY;
                translateX = (this.offsetWidth - width) / (2 * scaleX);
            }
        }
        this.style.transformOrigin = '0 0';
        this.style.scale = scaleX + ' ' + scaleY;
        this.style.translate = translateX + 'px ' + translateY + 'px';
        if (!this._resizeObserver) {
            this._resizeObserver = new ResizeObserver(() => { this._stretchView(settings); });
            this._resizeObserver.observe(this);
        }
    }
    _getRelativeSignalsPath() {
        return this._relativeSignalsPath;
    }
    connectedCallback() {
        this._refreshViewSubscription = iobrokerHandler.refreshView.on(() => this._loadScreen());
        this._screensChangedSubscription = iobrokerHandler.objectsChanged.on(() => {
            if (this._screenName)
                this._loadScreen();
        });
        this._scriptObject?.connectedCallback?.(this);
        for (let e of this.#eventListeners) {
            this.addEventListener(e[0], e[1]);
        }
        if (this._resizeObserver)
            this._resizeObserver.observe(this);
    }
    disconnectedCallback() {
        for (let e of this.#eventListeners) {
            this.removeEventListener(e[0], e[1]);
        }
        this._refreshViewSubscription?.dispose();
        this._screensChangedSubscription?.dispose();
        this._scriptObject?.disconnectedCallback?.(this);
        if (this._resizeObserver)
            this._resizeObserver.disconnect();
    }
    _assignEvent(event, callback) {
        const arrayEl = [event, callback];
        this.#eventListeners.push(arrayEl);
        this.addEventListener(event, callback);
        return {
            remove: () => {
                const index = this.#eventListeners.indexOf(arrayEl);
                this.#eventListeners.splice(index, 1);
                this.removeEventListener(event, callback);
            }
        };
    }
};
__decorate([
    property()
], ScreenViewer.prototype, "screenName", null);
__decorate([
    property()
], ScreenViewer.prototype, "relativeSignalsPath", null);
ScreenViewer = ScreenViewer_1 = __decorate([
    customElement("iobroker-webui-screen-viewer")
], ScreenViewer);
export { ScreenViewer };
