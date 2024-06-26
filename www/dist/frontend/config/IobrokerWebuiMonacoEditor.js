import { BaseCustomWebComponentConstructorAppend, LazyLoader, css, html } from "@node-projects/base-custom-webcomponent";
import { sleep } from "@node-projects/web-component-designer";
import { iobrokerHandler } from "../common/IobrokerHandler.js";
export class IobrokerWebuiMonacoEditor extends BaseCustomWebComponentConstructorAppend {
    static style = css `
        :host {
            display: block;
            height: 100%;
            width: 100%;
        }

        .errorDecoration {
            background-color: red !important;
        }
    `;
    static template = html `
        <div id="container" style="width: 100%; height: 100%; position: absolute;"></div>
    `;
    static properties = {
        language: String,
        singleRow: Boolean,
        value: String
    };
    async createModel(text) {
        await IobrokerWebuiMonacoEditor.initMonacoEditor();
        //@ts-ignore
        return monaco.editor.createModel(text, this.getLanguageName());
    }
    _model;
    get model() {
        return this._model;
    }
    set model(value) {
        this._model = value;
        if (this._editor)
            this._editor.setModel(value);
    }
    #value = null;
    get value() {
        if (this._editor)
            return this._editor.getModel().getValue();
        return null;
    }
    set value(v) {
        this.#value = v;
        if (this._editor)
            this._editor.getModel().setValue(v);
    }
    language = 'css';
    singleRow = false;
    editPart;
    #readOnly = false;
    get readOnly() {
        return this.#readOnly;
    }
    set readOnly(v) {
        this.#readOnly = v;
        if (this._editor)
            this._editor.updateOptions({ readOnly: v });
    }
    getLanguageName() {
        return this.language;
    }
    _container;
    _editor;
    static _initalized;
    constructor() {
        super();
    }
    static initMonacoEditor() {
        return new Promise(async (resolve) => {
            if (!IobrokerWebuiMonacoEditor._initalized) {
                await sleep(500);
                //@ts-ignore
                require.config({ paths: { 'vs': 'node_modules/monaco-editor/min/vs', 'vs/css': { disabled: true } } });
                //@ts-ignore
                require(['vs/editor/editor.main'], () => {
                    resolve(undefined);
                    IobrokerWebuiMonacoEditor._initalized = true;
                    import('./importDescriptions.json', { with: { type: 'json' } }).then(async (json) => {
                        let files = json.default;
                        const chunkSize = 500;
                        let libs = [];
                        for (let i = 0; i < files.length; i += chunkSize) {
                            const chunk = files.slice(i, i + chunkSize);
                            let promises = [];
                            chunk.forEach((f) => {
                                promises.push(LazyLoader.LoadText(f.file).then(content => {
                                    libs.push({ content, filePath: f.name });
                                }));
                            });
                            await Promise.allSettled(promises);
                        }
                        //@ts-ignore
                        monaco.languages.typescript.typescriptDefaults.setExtraLibs(libs);
                        //@ts-ignore
                        monaco.languages.typescript.javascriptDefaults.setExtraLibs(libs);
                    });
                });
            }
            else {
                resolve(undefined);
            }
        });
    }
    async ready() {
        this._parseAttributesToProperties();
        //@ts-ignore
        const style = await import("monaco-editor/min/vs/editor/editor.main.css", { with: { type: 'css' } });
        //@ts-ignore
        this.shadowRoot.adoptedStyleSheets = [style.default, this.constructor.style];
        this._container = this._getDomElement('container');
        await IobrokerWebuiMonacoEditor.initMonacoEditor();
        let options = {
            automaticLayout: true,
            language: this.getLanguageName(),
            fixedOverflowWidgets: true,
            minimap: {
                size: 'fill'
            },
            readOnly: this.#readOnly
        };
        if (this.singleRow) {
            options.minimap.enabled = false;
            options.lineNumbers = 'off';
            options.glyphMargin = false;
            options.folding = false;
            options.lineDecorationsWidth = 0;
            options.lineNumbersMinChars = 0;
        }
        //@ts-ignore
        this._editor = monaco.editor.create(this._container, options);
        if (this._model)
            this._editor.setModel(this._model);
        if (this.#value)
            this._editor.getModel().setValue(this.#value);
        if (this.singleRow) {
            this._editor.getModel().onDidChangeContent((e) => {
                this.dispatchEvent(new CustomEvent('value-changed'));
            });
        }
    }
    undo() {
        this._editor.trigger('', 'undo', null);
    }
    redo() {
        this._editor.trigger('', 'redo', null);
    }
    copy() {
        this._editor.trigger('', 'editor.action.clipboardCopyAction', null);
    }
    paste() {
        this._editor.trigger('', 'editor.action.clipboardPasteAction', null);
    }
    cut() {
        this._editor.trigger('', 'editor.action.clipboardCutAction', null);
    }
    delete() {
        this._editor.trigger('', 'editor.action.clipboardDeleteAction', null);
    }
    async executeCommand(command) {
        if (command.type == 'save') {
            if (this.language === 'css') {
                if (this.editPart === 'globalStyle')
                    iobrokerHandler.config.globalStyle = this.model.getValue();
                else if (this.editPart === 'fontDeclarations')
                    iobrokerHandler.config.fontDeclarations = this.model.getValue();
            }
            else if (this.language == 'javascript') {
                iobrokerHandler.config.globalScript = this.model.getValue();
            }
            await iobrokerHandler.saveConfig();
        }
    }
    canExecuteCommand(command) {
        if (command.type == 'save')
            return true;
        return false;
    }
    setSelection(lineStart, columnStart, lineEnd, columnEnd) {
        setTimeout(() => {
            this._editor.setSelection({ startLineNumber: lineStart, startColumn: columnStart, endLineNumber: lineEnd, endColumn: columnEnd });
            //@ts-ignore
            this._editor.revealRangeInCenterIfOutsideViewport(new monaco.Range(lineStart, columnStart, lineEnd, columnEnd), 1);
        }, 50);
    }
}
customElements.define('iobroker-webui-monaco-editor', IobrokerWebuiMonacoEditor);
