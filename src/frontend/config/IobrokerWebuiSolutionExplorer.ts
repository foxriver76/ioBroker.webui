import { BaseCustomWebComponentConstructorAppend, LazyLoader, css, html } from "@node-projects/base-custom-webcomponent";
import { dragDropFormatNameBindingObject, IBindableObject, IBindableObjectsService, IElementDefinition, ServiceContainer, dragDropFormatNameElementDefinition, ContextMenu, sleep } from "@node-projects/web-component-designer";
import { iobrokerHandler } from "../common/IobrokerHandler.js";
//@ts-ignore
import fancyTreeStyleSheet from "jquery.fancytree/dist/skin-win8/ui.fancytree.css" assert {type: 'css'};

type TreeNodeData = Fancytree.NodeData & {
    lazyload?: (event: any, data: any) => void,
    children?: TreeNodeData[] | undefined;
    autoExpand?: boolean,
    dblclick?: (event: any, data: any) => void,
    contextMenu?: (event: any, data: any) => void,
}
export class IobrokerWebuiSolutionExplorer extends BaseCustomWebComponentConstructorAppend {

    public static override template = html`
        <div id="treeDiv" class="" style="overflow: auto; width:100%; height: 100%;">
        </div>`

    public static override style = css``

    serviceContainer: ServiceContainer;

    private _treeDiv: HTMLDivElement;
    private _tree: Fancytree.Fancytree;
    private _screensNodeData: TreeNodeData;

    constructor() {
        super();
        this._treeDiv = this._getDomElement<HTMLDivElement>('treeDiv');
        //@ts-ignore
        this.shadowRoot.adoptedStyleSheets = [fancyTreeStyleSheet];
    }

    async ready() {

    }

    async initialize(serviceContainer: ServiceContainer) {
        this.serviceContainer = serviceContainer;
        iobrokerHandler.screensChanged.on(() => this._refreshScreensNode());
        await sleep(100);
        this._loadTree();
    }

    private async createTreeNodes() {
        const result = await Promise.allSettled(
            [
                this._createScreensNode(),
                this._createGlobalStyleNode(),
                this._createControlsNode(),
                this._createNpmsNode(),
                this._createImagesNode(),
                this._createChartsNode(),
                this._createIconsFolderNode(),
                this._createObjectsNode()
            ]);
        return result.map(x => x.status == 'fulfilled' ? x.value : null);
    }

    private async _createScreensNode() {
        this._screensNodeData = {
            title: 'Screens',
            folder: true,
            autoExpand: true,
            key: 'screens',
            lazy: true,
            lazyload: (event, node) => this._lazyLoadScreensNodes(event, node)
        }
        return this._screensNodeData;
    }

    private _lazyLoadScreensNodes(event: any, data: any) {
        data.result = new Promise<TreeNodeData[]>(async resolve => {
            let screenNodeCtxMenu = (event, screen) => {
                ContextMenu.show([{
                    title: 'Remove Screen', action: () => {
                        iobrokerHandler.removeScreen(screen);
                    }
                }], event);
            }
            let screens = await iobrokerHandler.getScreenNames();
            resolve(screens.map(x => ({
                title: x,
                folder: false,
                contextMenu: (event => screenNodeCtxMenu(event, x)),
                dblclick: (e, d) => {
                    iobrokerHandler.getScreen(d.node.data.name).then(s => {
                        window.appShell.openScreenEditor(d.node.data.name, s.html, s.style);
                    });
                },
                data: { type: 'screen', name: x }
            })));
        });
    }

    private async _refreshScreensNode() {
        const screensNode = this._tree.getNodeByKey('screens');
        if (screensNode) {
            screensNode.resetLazy();
            await sleep(50);
            screensNode.setExpanded(true);
        }
    }

    private async _createGlobalStyleNode(): Promise<TreeNodeData> {
        let ctxMenu = (event) => {
            ContextMenu.show([{
                title: 'Add HabPanel Style', action: async () => {
                    let text = await LazyLoader.LoadText('./assets/styleTemplates/HabPanelStyle.css');
                    if (!iobrokerHandler.config.globalStyle)
                        iobrokerHandler.config.globalStyle = '';
                    iobrokerHandler.config.globalStyle += '\n\n' + text;
                    iobrokerHandler.config.globalStyle = iobrokerHandler.config.globalStyle.trim();
                    iobrokerHandler.saveConfig();
                }
            }], event);
        }
        return {
            title: 'Global Style',
            folder: false,
            contextMenu: (e, data) => ctxMenu(e),
            dblclick: (e, data) => {
                window.appShell.openGlobalStyleEditor(iobrokerHandler.config.globalStyle ?? '');
            }
        }
    }

    private async _createNpmsNode() {
        let npmsNode: TreeNodeData = {
            title: 'Packages',
            folder: true,
            contextMenu: (event) => {
                ContextMenu.show([{
                    title: 'Add Package', action: () => {
                        const packageName = prompt("NPM Package Name");
                        if (packageName)
                            iobrokerHandler.sendCommand("addNpm", packageName);
                    }
                }], event);
            },
            children: []
        }

        let npmNodeCtxMenu = (event, packageName) => {
            ContextMenu.show([{
                title: 'Update Package', action: () => {
                    iobrokerHandler.sendCommand("updateNpm", packageName);
                }
            },
            {
                title: 'Remove Package', action: () => {
                    iobrokerHandler.sendCommand("removeNpm", packageName);
                }
            }], event);
        }

        let npmInstalled: TreeNodeData = {
            title: 'Installed',
            folder: true,
            contextMenu: (event) => {
                ContextMenu.show([{
                    title: 'Add Package', action: () => {
                        const packageName = prompt("NPM Package Name");
                        if (packageName)
                            iobrokerHandler.sendCommand("addNpm", packageName);
                    }
                }], event);
            },
            lazy: true,
            lazyload: (e, data) => {
                data.result = new Promise(async resolve => {
                    try {
                        await iobrokerHandler.waitForReady();
                        let packageJson = JSON.parse(await (await iobrokerHandler.connection.readFile(iobrokerHandler.adapterName, "widgets/package.json", false)).file);
                        let children = Object.keys(packageJson.dependencies).map(x => ({
                            title: x + ' (' + packageJson.dependencies[x] + ')',
                            folder: false,
                            contextMenu: (event => npmNodeCtxMenu(event, x)),
                            data: { type: 'npm', name: x }
                        }));

                        //todo
                        //search every package for a package JsonFileElementsService, and look if it contains a customElements definition
                        //if so, load the file, if not, try load "custom-elements.json"
                        resolve(children);
                    }
                    catch (err) {
                        console.warn("error loading package.json, may not yet exist", err);
                    }
                    resolve([]);
                });
            }
        }

        let npmSuggestion: TreeNodeData = {
            title: 'Suggestions',
            folder: true,
            tooltip: 'doublecklick to install',
            lazy: true,
            lazyload: (e, data) => {
                data.result = new Promise(async resolve => {
                    try {
                        let packages = (await import('../npm/usable-packages.json', { assert: { type: 'json' } })).default;
                        let groups = [...new Set(packages.map(x => x.split('/')[0]))];
                        let children: TreeNodeData[] = [];
                        for (let g of groups) {
                            let elements = packages.filter(x => x.startsWith(g));
                            if (elements.length == 1) {
                                children.push({
                                    title: elements[0],
                                    folder: false,
                                    tooltip: elements[0],
                                    dblclick: (e, data) => {
                                        iobrokerHandler.sendCommand("addNpm", elements[0]);
                                    }
                                });
                            } else {
                                children.push({
                                    title: g,
                                    folder: true,
                                    tooltip: g,
                                    children: elements.map(x => ({
                                        title: x.split('/')[1],
                                        folder: false,
                                        tooltip: x.split('/')[1],
                                        dblclick: (e, data) => {
                                            iobrokerHandler.sendCommand("addNpm", x);
                                        }
                                    }))
                                });
                            }
                        }
                        resolve(children);
                    }
                    catch (err) {
                        console.warn("error loading usable-packages.json, may not yet exist", err);
                    }
                    resolve([]);
                });
            }
        }

        npmsNode.children.push(npmInstalled);
        npmsNode.children.push(npmSuggestion);

        return npmsNode;
    }

    private async _createIconsFolderNode() {
        let iconsNode: TreeNodeData = {
            title: 'Icons',
            folder: true,
            lazy: true,
            lazyload: (e, data) => {
                data.result = new Promise(async resolve => {
                    await iobrokerHandler.waitForReady();
                    const iconDirs = await iobrokerHandler.connection.readDir(iobrokerHandler.adapterName, "assets/icons");
                    const iconDirNodes: TreeNodeData[] = [];
                    for (let d of iconDirs) {
                        if (d.isDir)
                            iconDirNodes.push({
                                title: d.file,
                                folder: true,
                                lazy: true,
                                lazyload: (e, data) => {
                                    this._createIconsNodes(d.file, data);
                                }
                            });
                    }
                    resolve(iconDirNodes);
                });
            }
        }

        return iconsNode;
    }

    private async _createIconsNodes(dirName: string, data) {
        data.result = new Promise(async resolve => {
            let icons: TreeNodeData[] = [];
            await iobrokerHandler.waitForReady();
            const dirList = await iobrokerHandler.connection.readDir(iobrokerHandler.adapterName, "assets/icons/" + dirName);

            for (let d of dirList) {
                if (d.file.endsWith('.svg'))
                    icons.push({ title: d.file.substring(0, d.file.length - 4), icon: './assets/icons/' + dirName + '/' + d.file, data: { type: 'icon', file: './assets/icons/' + dirName + '/' + d.file } });
            }
            resolve(icons);
        });
    }

    private async _createImagesNode() {
        let imagesNode: TreeNodeData = {
            title: 'Images', folder: true, lazy: true,
            lazyload: (e, data) => {
                data.result = new Promise(async resolve => {
                    try {
                        await iobrokerHandler.waitForReady();
                        let images = await iobrokerHandler.getImageNames();
                        resolve(images.map(x => ({
                            title: x,
                            icon: iobrokerHandler.imagePrefix + x,
                            data: { type: 'image', name: x }
                        })));
                    }
                    catch (err) {
                        console.warn("error loading flot charts", err);
                    }
                });
            }
        }
        return imagesNode;
    }

    private async _createChartsNode() {
        let chartsNode: TreeNodeData = {
            title: 'Charts', folder: true, lazy: true,
            lazyload: (e, data) => {
                data.result = new Promise(async resolve => {
                    let chartNodes = [];
                    try {
                        await iobrokerHandler.waitForReady();
                        let objs = await iobrokerHandler.connection.getObjectViewCustom('chart', 'chart', 'flot.', 'flot.\u9999');
                        if (Object.keys(objs).length > 0) {
                            let flotNode: TreeNodeData = {
                                title: 'Flot', folder: true
                            }
                            chartNodes.push(flotNode);
                            flotNode.children = Object.keys(objs).map(x => ({
                                title: x.split('.').pop(),
                                folder: false,
                                data: { type: 'flot', name: objs[x].native.url }
                            }));
                        }
                    }
                    catch (err) {
                        console.warn("error loading flot charts", err);
                    }
                    try {
                        await iobrokerHandler.waitForReady();
                        let objs = await iobrokerHandler.connection.getObjectViewCustom('chart', 'chart', 'echarts.', 'echarts.\u9999');
                        if (Object.keys(objs).length > 0) {
                            let flotNode: TreeNodeData = {
                                title: 'ECharts', folder: true
                            }
                            chartNodes.push(flotNode);
                            flotNode.children = Object.keys(objs).map(x => ({
                                title: x.split('.').pop(),
                                folder: false,
                                data: { type: 'echart', name: x }
                            }));
                        }
                    }
                    catch (err) {
                        console.warn("error loading echarts charts", err);
                    }

                    resolve(chartNodes);
                });
            }
        }



        return chartsNode;
    }

    private async _createControlsNode() {
        let controlsNode: TreeNodeData = {
            title: 'Controls', folder: true, children: []
        }

        for (const s of this.serviceContainer.elementsServices) {
            const newNode: TreeNodeData = {
                title: s.name,
                folder: true,
                children: []
            };
            controlsNode.children.push(newNode);

            try {
                let elements = await s.getElements();
                for (let e of elements) {
                    newNode.children.push({
                        title: e.name ?? e.tag,
                        folder: false,
                        data: {
                            type: 'control',
                            ref: e
                        }
                    });
                }
            } catch (err) {
                console.warn('Error loading elements', err);
            }
        }

        return controlsNode;
    }

    private async _createObjectsNode() {
        const s = this.serviceContainer.bindableObjectsServices[0];
        const objectsNode: TreeNodeData = {
            title: 'Objects',
            data: { service: s },
            folder: true,
            lazy: true,
            lazyload: (event, node) => this._lazyLoadObjectNodes(event, node)
        }
        return objectsNode;
    }

    private _lazyLoadObjectNodes(event: any, data: any) {
        data.result = new Promise(async resolve => {
            const service: IBindableObjectsService = data.node.data.service;
            const bindable: IBindableObject<any> = data.node.data.bindable;
            let objs: IBindableObject<any>[];
            if (bindable?.children)
                objs = bindable.children;
            else
                objs = await service.getBindableObjects(bindable);
            resolve(objs.map(x => ({
                service,
                title: x.name,
                data: {
                    type: 'object',
                    bindable: x
                },
                folder: x.children !== false,
                lazy: x.children !== false,
                lazyload: (event, node) => this._lazyLoadObjectNodes(event, node)
            })));
        });
    }

    private _loadTree() {
        if (!this._tree) {
            $(this._treeDiv).fancytree(<Fancytree.FancytreeOptions>{
                icon: false,
                source: this.createTreeNodes(),
                lazyLoad: (event, n) => n.node.data.lazyload(event, n),
                copyFunctionsToData: true,
                extensions: ['dnd5'],
                dblclick: (e, data) => {
                    if (data.node.data.dblclick)
                        data.node.data.dblclick(e, data);
                    return true;
                },
                createNode: (event, data) => {
                    let span = data.node.span as HTMLSpanElement;
                    span.oncontextmenu = (e) => {
                        data.node.setActive();
                        if (data.node.data.contextMenu)
                            data.node.data.contextMenu(e, data);
                        e.preventDefault();
                        return false;
                    }
                },
                init: function (event, data) {
                    let expandChildren = (node) => {
                        if (node.data.autoExpand && !node.isExpanded()) {
                            node.setExpanded(true);
                        }
                        if (node.children && node.children.length > 0) {
                            try {
                                node.children.forEach(expandChildren);
                            } catch (error) {
                            }
                        }
                    };
                    expandChildren(data.tree.rootNode);
                },

                dnd5: {
                    dropMarkerParent: this.shadowRoot,
                    preventRecursion: true, // Prevent dropping nodes on own descendants
                    preventVoidMoves: false,
                    dropMarkerOffsetX: -24,
                    dropMarkerInsertOffsetX: -16,

                    dragStart: (node, data) => {
                        if (data.node.data.type == 'screen') {
                            const screen = data.node.data.name;
                            const elementDef: IElementDefinition = { tag: "iobroker-webui-screen-viewer", defaultAttributes: { 'screen-name': screen }, defaultWidth: '300px', defaultHeight: '200px' }
                            data.effectAllowed = "all";
                            data.dataTransfer.setData('text/json/elementDefintion', JSON.stringify(elementDef));
                            data.dropEffect = "copy";
                            return true;
                        } else if (data.node.data.type == 'image') {
                            const image = data.node.data.name;
                            const elementDef: IElementDefinition = { tag: "img", defaultAttributes: { 'src': iobrokerHandler.imagePrefix + image } }
                            data.effectAllowed = "all";
                            data.dataTransfer.setData('text/json/elementDefintion', JSON.stringify(elementDef));
                            data.dropEffect = "copy";
                            return true;
                        } else if (data.node.data.type == 'flot') {
                            const url = 'http://' + window.iobrokerHost + ':' + window.iobrokerPort + '/flot/index.html?' + data.node.data.name;
                            const elementDef: IElementDefinition = { tag: "iframe", defaultAttributes: { 'src': url }, defaultStyles: { 'border': '1px solid black;' }, defaultWidth: '400px', defaultHeight: '300px' }
                            data.effectAllowed = "all";
                            data.dataTransfer.setData('text/json/elementDefintion', JSON.stringify(elementDef));
                            data.dropEffect = "copy";
                            return true;
                        } else if (data.node.data.type == 'echart') {
                            const url = 'http://' + window.iobrokerHost + ':' + window.iobrokerPort + '/echarts/index.html?preset=' + data.node.data.name;
                            const elementDef: IElementDefinition = { tag: "iframe", defaultAttributes: { 'src': url }, defaultStyles: { 'border': '1px solid black;' }, defaultWidth: '400px', defaultHeight: '300px' }
                            data.effectAllowed = "all";
                            data.dataTransfer.setData('text/json/elementDefintion', JSON.stringify(elementDef));
                            data.dropEffect = "copy";
                            return true;
                        } else if (data.node.data.type == 'object') {
                            data.effectAllowed = "all";
                            data.dataTransfer.setData(dragDropFormatNameBindingObject, JSON.stringify(node.data.bindable));
                            data.dropEffect = "copy";
                            return true;
                        } else if (data.node.data.type == 'control') {
                            data.effectAllowed = "all";
                            data.dataTransfer.setData(dragDropFormatNameElementDefinition, JSON.stringify(node.data.ref));
                            data.dropEffect = "copy";
                            return true;
                        } else if (data.node.data.type == 'icon') {
                            const elementDef: IElementDefinition = { tag: "iobroker-webui-svg-image", defaultAttributes: { 'src': data.node.data.file }, defaultWidth: '32px', defaultHeight: '32px' }
                            data.effectAllowed = "all";
                            data.dataTransfer.setData('text/json/elementDefintion', JSON.stringify(elementDef));
                            data.dropEffect = "copy";
                            return true;
                        }

                        return false;
                    },
                    dragEnter: (node, data) => {
                        return false;
                    }
                }
            });

            //@ts-ignore
            this._tree = $.ui.fancytree.getTree(this._treeDiv);
        } else {
            this._tree.reload(this.createTreeNodes());
        }
    }
}

customElements.define("iobroker-webui-solution-explorer", IobrokerWebuiSolutionExplorer);