/// <reference types="iobroker" />
import { Connection } from "@iobroker/socket-client";
import { TypedEvent } from "@node-projects/base-custom-webcomponent";
import { IScreen } from "./interfaces/IScreen";
declare global {
    interface Window {
        iobrokerHost: string;
        iobrokerPort: number;
        iobrokerWebuiRootUrl: string;
    }
}
declare class IobrokerHandler {
    static instance: IobrokerHandler;
    host: ioBroker.HostObject;
    connection: Connection;
    adapterName: string;
    configPath: string;
    private _screens;
    screensChanged: TypedEvent<void>;
    stylesChanged: TypedEvent<void>;
    constructor();
    init(): Promise<void>;
    loadWidgets(): Promise<void>;
    readAllScreens(): Promise<void>;
    saveScreen(name: string, screen: IScreen): Promise<void>;
    getScreenNames(): string[];
    getScreen(name: string): IScreen;
}
export declare const iobrokerHandler: IobrokerHandler;
export {};
