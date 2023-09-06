import { BasePropertyEditor, BindableObjectsBrowser, IProperty, ValueType } from "@node-projects/web-component-designer";

export class IobrokerSignalPropertyEditor extends BasePropertyEditor<HTMLElement> {

    _ip: HTMLInputElement;

    constructor(property: IProperty) {
        super(property);

        let cnt = document.createElement('div');
        cnt.style.display = 'flex';
        this._ip = document.createElement('input');
        this._ip.onchange = (e) => this._valueChanged(this._ip.value);
        this._ip.onfocus = (e) => {
            this._ip.selectionStart = 0;
            this._ip.selectionEnd = this._ip.value?.length;
        }
        cnt.appendChild(this._ip);
        let btn = document.createElement('button');
        btn.textContent = '...';
        btn.onclick = async () => {
            let b = new BindableObjectsBrowser();
            b.initialize(this.designItems[0].serviceContainer);
            b.title = 'select signal...';
            const abortController = new AbortController();
            b.objectDoubleclicked.on(() => {
                abortController.abort();
                this._ip.value = b.selectedObject.fullName;
                this._valueChanged(this._ip.value);
            });
            let res = await window.appShell.openConfirmation(b, 100, 100, 400, 300, null, abortController.signal);
            if (res) {
                this._ip.value = b.selectedObject.fullName;
                this._valueChanged(this._ip.value);
            }
        }
        cnt.appendChild(btn);
        this.element = cnt;
    }

    refreshValue(valueType: ValueType, value: any) {
        if (value == null)
            this._ip.value = "";
        else
            this._ip.value = value;
    }
}