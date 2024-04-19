import * as utils from '@iobroker/adapter-core';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Uploadhelper } from './UploadHelper.js';
import { ImportmapCreator } from './ImportmapCreator.js';
import url from "node:url";

const __dirname = path.normalize(path.join(path.dirname(fileURLToPath(import.meta.url)), "../.."));
const pkg = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url)).toString());
const adapterName = pkg.name.split('.').pop();

class WebUi extends utils.Adapter {

    _unloaded: boolean;
    _instanceName = 'webui.0'
    _npmNamespace = this._instanceName + '.widgets'
    _dataNamespace = this._instanceName + '.data'
    _stateNpm = 'state.npm';
    _stateCommand = 'webui.0.control.command';

    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options?) {
        super({
            ...options,
            name: adapterName,
        });
        this.on('ready', this.main.bind(this));
        this.on('stateChange', this.stateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async runUpload() {
        await Uploadhelper.upload(this, this._npmNamespace, this.widgetsDir, '');
    }

    async refreshWWW() {
        await this.runUpload();
        this.setState(this._stateCommand, { val: 'uiReloadPackages', ack: true });
    }

    widgetsDir = __dirname + '/widgets';

    npmRunning = false;

    async creatWidgetsDirAndRestorePackageJsonIfneeded() {
        if (this._unloaded)
            return;
        if (!fs.existsSync(this.widgetsDir))
            await fs.promises.mkdir(this.widgetsDir)
        if (!fs.existsSync(this.widgetsDir + '/package.json')) {
            this.log.info(`no packages.json in widgets dir found, creating one`);
            if (await this.fileExistsAsync(this._dataNamespace, 'package.json')) {
                this.log.info(`adapter was updated, restore existing packages.json`);
                let data = await this.readFileAsync(this._dataNamespace, 'package.json')
                await fs.promises.writeFile(this.widgetsDir + '/package.json', data.file);
            } else {
                await fs.promises.writeFile(this.widgetsDir + '/package.json', '{}');
            }
        }
    }

    async backupPackageJson() {
        if (this._unloaded)
            return;
        if (fs.existsSync(this.widgetsDir + '/package.json')) {
            if (await this.fileExistsAsync(this._dataNamespace, 'package.json')) {
                await this.delFileAsync(this._dataNamespace, 'package.json');
            }
            let data = await fs.promises.readFile(this.widgetsDir + '/package.json');
            await this.writeFileAsync(this._dataNamespace, 'package.json', data);
        }
    }

    checkPackageName(name: string) {
        return /[a-z@\-_\/]/.test(name);
    }

    installNpm(name) {
        return new Promise(async resolve => {
            if (!this.checkPackageName(name)) {
                this.log.error(`Invalid NPM Package Name: ${name}`);
                resolve(null);
            }
            if (this.npmRunning) {
                this.log.info(`NPM already running`);
                resolve(null);
            }
            if (this._unloaded) {
                this.log.info(`unloaded`);
                resolve(null);
            }
            this.npmRunning = true;
            this.log.info(`Install NPM package (${name}), check dirs...`);
            await this.creatWidgetsDirAndRestorePackageJsonIfneeded();
            this.log.info(`Install NPM package (${name})...`);
            const child = spawn('npm', ['install', '--omit=dev', '--ignore-scripts', name], { cwd: this.widgetsDir, shell: process.platform == 'win32' });
            child.stdout.on('data', data => {
                this.log.debug(data.toString().replace('\n', ''));
            });
            child.stderr.on('data', data => this.log.error(data.toString().replace('\n', '')));
            child.on('exit', async exitCode => {
                this.log.info(`Installed NPM packge (${name}). ${exitCode ? 'Exit - ' + exitCode : ''}`);
                this.npmRunning = false;
                await this.backupPackageJson();
                resolve(exitCode);
            });
        });
    }

    removeNpm(name) {
        return new Promise(async resolve => {
            if (!this.checkPackageName(name)) {
                this.log.error(`Invalid NPM Package Name: ${name}`);
                resolve(null);
            }
            if (this.npmRunning) {
                this.log.info(`NPM already running`);
                resolve(null);
            }
            if (this._unloaded) {
                this.log.info(`unloaded`);
                resolve(null);
            }
            this.npmRunning = true;
            this.log.info(`Remove NPM package (${name}), check dirs...`);
            await this.creatWidgetsDirAndRestorePackageJsonIfneeded();
            this.log.info(`Remove NPM package (${name})...`);
            const child = spawn('npm', ['remove', name], { cwd: this.widgetsDir, shell: process.platform == 'win32' });
            child.stdout.on('data', data => {
                this.log.debug(data.toString().replace('\n', ''));
            });
            child.stderr.on('data', data => this.log.error(data.toString().replace('\n', '')));
            child.on('exit', async exitCode => {
                this.log.info(`Remove NPM packge (${name}). ${exitCode ? 'Exit - ' + exitCode : ''}`);
                this.npmRunning = false;
                await this.backupPackageJson();
                resolve(exitCode);
            });
        });
    }

    states = {}

    async stateChange(id, state) {
        this.log.debug(`stateChange: ${id}, value: ${state.val}, ack: ${state.ack}`);
        if (!id || !state) return;

        if (state.ack) {
            return;
        }

        this.states[id] = state.val;
        if (id === this._stateCommand)
            await this.runCommand(this.states[this._stateCommand], this.states["webui.0.control.data"])
        await this.setStateAsync(id, state, true);
    }

    async createImportMapAndLoaderFiles() {
        try {
            if (this._unloaded)
                return;
            this.log.info(`create importMap...`);
            const imc = new ImportmapCreator(this, this.widgetsDir, '/' + this._npmNamespace + '/node_modules');
            await imc.parsePackages();
            this.log.info(`importMap: ` + JSON.stringify(imc.importMap));
        }
        catch (err) {
            this.log.error(`createImportMapAndLoaderFiles(): ` + err);
        }
    }

    async runCommand(command, parameter) {
        this.log.info(`runCommand: ${command}, parameter: ${parameter}`);

        switch (command) {
            case 'addNpm':
                await this.setState(this._stateNpm, { val: 'installing npm package "' + parameter + '"', ack: true });
                await this.installNpm(parameter);
                await this.setState(this._stateNpm, { val: 'create importmap', ack: true });
                await this.createImportMapAndLoaderFiles();
                await this.setState(this._stateNpm, { val: 'uploading', ack: true });
                await this.refreshWWW();
                await this.setState(this._stateNpm, { val: 'idle', ack: true });
                break;
            case 'updateNpm':
                await this.setState(this._stateNpm, { val: 'updateing npm package "' + parameter + '"', ack: true });
                await this.installNpm(parameter + '@latest');
                await this.setState(this._stateNpm, { val: 'create importmap', ack: true });
                await this.createImportMapAndLoaderFiles();
                await this.setState(this._stateNpm, { val: 'uploading', ack: true });
                await this.refreshWWW();
                await this.setState(this._stateNpm, { val: 'idle', ack: true });
                break;
            case 'removeNpm':
                await this.setState(this._stateNpm, { val: 'removeing npm package "' + parameter + '"', ack: true });
                await this.removeNpm(parameter);
                await this.setState(this._stateNpm, { val: 'create importmap', ack: true });
                await this.createImportMapAndLoaderFiles();
                await this.setState(this._stateNpm, { val: 'uploading', ack: true });
                await this.refreshWWW();
                await this.setState(this._stateNpm, { val: 'idle', ack: true });
                break;
            case 'createImportmap':
                await this.setState(this._stateNpm, { val: 'create importmap', ack: true });
                await this.createImportMapAndLoaderFiles();
                await this.setState(this._stateNpm, { val: 'uploading', ack: true });
                await this.refreshWWW();
                await this.setState(this._stateNpm, { val: 'idle', ack: true });
                break;
            case 'refreshWww':
                await this.setState(this._stateNpm, { val: 'uploading', ack: true });
                await this.refreshWWW();
                await this.setState(this._stateNpm, { val: 'idle', ack: true });
                break;
        }
    }

    async main() {
        this.log.info(`dirName: ` + __dirname);
        await this.setState(this._stateNpm, { val: 'idle', ack: true });
        await this.subscribeStatesAsync('*', {});
        this.log.info(`adapter ready`);
    }

    onUnload() {
        this._unloaded = true;
    }
}


const modulePath = url.fileURLToPath(import.meta.url);
if (process.argv[1] === modulePath) {
    new WebUi();
}

export default function startAdapter(options: Partial<utils.AdapterOptions> | undefined) {
    return new WebUi(options);
}
