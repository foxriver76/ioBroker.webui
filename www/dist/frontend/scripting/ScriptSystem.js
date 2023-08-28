import { iobrokerHandler } from "../common/IobrokerHandler.js";
import { ScreenViewer } from "../runtime/ScreenViewer.js";
import Long from 'long';
export class ScriptSystem {
    static async execute(scriptCommands, outerContext) {
        for (let c of scriptCommands) {
            switch (c.type) {
                case 'OpenScreen': {
                    if (!c.openInDialog) {
                        if (c.noHistory) {
                            document.getElementById('viewer').relativeSignalsPath = c.relativeSignalsPath;
                            document.getElementById('viewer').screenName = ScriptSystem.getValue(c.screen, outerContext);
                        }
                        else {
                            let hash = 'screenName=' + ScriptSystem.getValue(c.screen, outerContext);
                            window.location.hash = hash;
                        }
                    }
                    else {
                        let sv = new ScreenViewer();
                        sv.relativeSignalsPath = c.relativeSignalsPath;
                        sv.screenName = ScriptSystem.getValue(c.screen, outerContext);
                    }
                    break;
                }
                case 'OpenUrl': {
                    window.open(c.url, c.target);
                    break;
                }
                case 'ToggleSignalValue': {
                    let state = await iobrokerHandler.connection.getState(c.signal);
                    await iobrokerHandler.connection.setState(c.signal, !state.val);
                    break;
                }
                case 'SetSignalValue': {
                    await iobrokerHandler.connection.setState(c.signal, ScriptSystem.getValue(c.value, outerContext));
                    break;
                }
                case 'IncrementSignalValue': {
                    let state = await iobrokerHandler.connection.getState(c.signal);
                    await iobrokerHandler.connection.setState(c.signal, state.val + ScriptSystem.getValue(c.value, outerContext));
                    break;
                }
                case 'DecrementSignalValue': {
                    let state = await iobrokerHandler.connection.getState(c.signal);
                    await iobrokerHandler.connection.setState(c.signal, state.val - ScriptSystem.getValue(c.value, outerContext));
                    break;
                }
                case 'SetBitInSignal': {
                    let state = await iobrokerHandler.connection.getState(c.signal);
                    let mask = Long.fromNumber(1).shiftLeft(c.bitNumber);
                    const newVal = Long.fromNumber(state.val).or(mask).toNumber();
                    await iobrokerHandler.connection.setState(c.signal, newVal);
                    break;
                }
                case 'ClearBitInSignal': {
                    let state = await iobrokerHandler.connection.getState(c.signal);
                    let mask = Long.fromNumber(1).shiftLeft(c.bitNumber);
                    mask.negate();
                    const newVal = Long.fromNumber(state.val).and(mask).toNumber();
                    await iobrokerHandler.connection.setState(c.signal, newVal);
                    break;
                }
                case 'ToggleBitInSignal': {
                    let state = await iobrokerHandler.connection.getState(c.signal);
                    let mask = Long.fromNumber(1).shiftLeft(c.bitNumber);
                    const newVal = Long.fromNumber(state.val).xor(mask).toNumber();
                    await iobrokerHandler.connection.setState(c.signal, newVal);
                    break;
                }
                case 'Javascript': {
                    var context = outerContext; // make context accessible from script
                    context.shadowRoot = context.element.getRootNode();
                    eval(c.script);
                    break;
                }
                case 'SetElementProperty': {
                    let host = outerContext.element.getRootNode().host;
                    if (c.targetSelectorTarget == 'currentElement')
                        host = outerContext.element;
                    else if (c.targetSelectorTarget == 'parentElement')
                        host = outerContext.element.parentElement;
                    else if (c.targetSelectorTarget == 'parentScreen')
                        host = host.getRootNode().host;
                    let elements = [host];
                    if (c.targetSelector)
                        elements = host.shadowRoot.querySelectorAll(c.targetSelector);
                    for (let e of elements) {
                        if (c.target == 'attribute') {
                            e.setAttribute(c.name, c.value);
                        }
                        else if (c.target == 'property') {
                            e[c.name] = c.value;
                        }
                        else if (c.target == 'css') {
                            e.style[c.name] = c.value;
                        }
                    }
                }
            }
        }
    }
    static getValue(value, outerContext) {
        return value;
    }
    static async assignAllScripts(shadowRoot, instance) {
        const allElements = shadowRoot.querySelectorAll('*');
        const scriptTag = shadowRoot.querySelector('script[type=module]');
        let jsObject = null;
        if (scriptTag) {
            try {
                const scriptUrl = URL.createObjectURL(new Blob([scriptTag.textContent], { type: 'application/javascript' }));
                //@ts-ignore
                jsObject = await importShim(scriptUrl);
                if (jsObject.init) {
                    jsObject.init(instance);
                }
            }
            catch (err) {
                console.warn('error parsing javascript', err);
            }
        }
        for (let e of allElements) {
            for (let a of e.attributes) {
                if (a.name[0] == '@') {
                    try {
                        let evtName = a.name.substring(1);
                        let script = a.value.trim();
                        if (script[0] == '{') {
                            let scriptObj = JSON.parse(script);
                            e.addEventListener(evtName, (evt) => ScriptSystem.execute(scriptObj.commands, { event: evt, element: e }));
                        }
                        else {
                            e.addEventListener(evtName, (evt) => {
                                if (!jsObject[script])
                                    console.warn('javascritp function named: ' + script + ' not found, maybe missing a "export" ?');
                                else
                                    jsObject[script](evt, e, shadowRoot);
                            });
                        }
                    }
                    catch (err) {
                        console.warn('error assigning script', e, a);
                    }
                }
            }
        }
    }
}
