import { AdapterInstance } from '@iobroker/adapter-core';
import fs from 'fs';

export class Uploadhelper {

    private _adapter: AdapterInstance;
    private _adapterName: string;
    private _stoppingPromise = false;
    private _lastProgressUpdate: number;

    private _ignoredFileExtensions = [
        '.npmignore',
        '.gitignore',
        '.DS_Store',
        '_socket/info.js'
    ]

    private _uploadStateObjectName

    constructor(adapter: AdapterInstance) {
        this._adapter = adapter;
        this._adapterName = this._adapter.name;
        this._uploadStateObjectName = `system.adapter.${this._adapterName}.upload`;
    }

    public static async upload(adapter: AdapterInstance, dir: string) {
        const hlp = new Uploadhelper(adapter);
        await hlp.upload(dir)
    }

    async upload(dir: string) {
        if (!fs.existsSync(dir)) {
            return;
        }

        await this._adapter.setForeignStateAsync(`system.adapter.${this._adapterName}.upload`, 0, true);

        let result;
        try {
            result = await this._adapter.getForeignObjectAsync(this._adapterName);
        } catch {
            // ignore
        }
        // Read all names with subtrees from the local directory
        const files = this.walk(dir);
        const { filesToDelete } = await this.collectExistingFilesToDelete(dir);

        this._adapter.log.debug(`Erasing files: ${filesToDelete.length}`);

        if (this._stoppingPromise) {
            return;
        }

        for (let f of filesToDelete) {
            this._adapter.log.debug(`Erasing file: ${f}`);
        }
        // delete old files, before upload of new
        //await this.eraseFiles(filesToDelete);
        //await this.uploadInternal(files);

        if (this._stoppingPromise) {
            return;
        }
    }


    async collectExistingFilesToDelete(path) {
        let _files = [];
        let _dirs = [];
        let files;

        if (this._stoppingPromise) {
            return { filesToDelete: _files, dirs: _dirs };
        }

        try {
            this._adapter.log.debug(`Scanning ${path}`);
            files = await this._adapter.readDirAsync(this._adapterName, path);
        } catch {
            // ignore err
            files = [];
        }

        if (files && files.length) {
            for (const file of files) {
                if (file.file === '.' || file.file === '..') {
                    continue;
                }
                const newPath = path + file.file;
                if (file.isDir) {
                    if (!_dirs.find(e => e.path === newPath)) {
                        _dirs.push({ adapter: this._adapter, path: newPath });
                    }
                    try {
                        const result = await this.collectExistingFilesToDelete(`${newPath}/`);
                        if (result.filesToDelete) {
                            _files = _files.concat(result.filesToDelete);
                        }

                        _dirs = _dirs.concat(result.dirs);
                    } catch (err) {
                        this._adapter.log.warn(`Cannot delete folder "${this._adapter}${newPath}/": ${err.message}`);
                    }
                } else if (!_files.find(e => e.path === newPath)) {
                    _files.push(newPath);
                }
            }
        }

        return { filesToDelete: _files, dirs: _dirs };
    }

    async eraseFiles(files) {
        if (files && files.length) {
            for (const file of files) {
                if (this._stoppingPromise) {
                    return;
                }
                try {
                    await this._adapter.unlinkAsync(this._adapterName, file);
                } catch (err) {
                    this._adapter.log.error(`Cannot delete file "${file}": ${err}`);
                }
            }
        }
    }

    async uploadInternal(files) {
        await this._adapter.setForeignStateAsync(this._uploadStateObjectName, { val: 0, ack: true });

        const wwwLen = (`${__dirname}/www/`).length;

        for (let f = 0; f < files.length; f++) {
            const file = files[f];

            if (this._stoppingPromise) {
                return;
            }

            let attName = file.substring(wwwLen).replace(/\\/g, '/');

            // write upload status into log
            if (files.length - f > 100) {
                (!f || !((files.length - f - 1) % 50)) &&
                    this._adapter.log.debug(`upload [${files.length - f - 1}] ${file.substring(wwwLen)} ${attName}`);
            } else if (files.length - f - 1 > 20) {
                (!f || !((files.length - f - 1) % 10)) &&
                    this._adapter.log.debug(`upload [${files.length - f - 1}] ${file.substring(wwwLen)} ${attName}`);
            } else {
                this._adapter.log.debug(`upload [${files.length - f - 1}] ${file.substring(wwwLen)} ${attName}`);
            }

            // Update upload indicator
            const now = Date.now();
            if (!this._lastProgressUpdate || now - this._lastProgressUpdate > 1000) {
                this._lastProgressUpdate = now;
                await this._adapter.setForeignStateAsync(this._uploadStateObjectName, {
                    val: Math.round((1000 * (files.length - f)) / files.length) / 10,
                    ack: true,
                });
            }

            try {
                const data = fs.readFileSync(file);
                await this._adapter.writeFileAsync(this._adapterName, attName, data);
            } catch (e) {
                this._adapter.log.error(`Error: Cannot upload ${file}: ${e.message}`);
            }
        }

        // Set upload progress to 0;
        if (files.length) {
            await this._adapter.setForeignStateAsync(this._uploadStateObjectName, { val: 0, ack: true });
        }

        return this._adapter;
    }

    // Read synchronous all files recursively from local directory
    walk(dir, _results?) {
        const results = _results || [];

        if (this._stoppingPromise) {
            return results;
        }

        try {
            if (fs.existsSync(dir)) {
                const list = fs.readdirSync(dir);
                list.map(file => {
                    const stat = fs.statSync(`${dir}/${file}`);
                    if (stat.isDirectory()) {
                        this.walk(`${dir}/${file}`, results);
                    } else {
                        if (!this._ignoredFileExtensions.some(x => file.endsWith(x))) {
                            results.push(`${dir}/${file}`);
                        }
                    }
                });
            }
        } catch (err) {
            console.error(err);
        }

        return results;
    }
}