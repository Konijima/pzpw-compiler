import { join } from "path";
import { readFile, writeFile } from "fs/promises";

export type SettingValue = string | number | boolean;

export interface ISettings {
    [key: string]: any
    
    /**
     * Store default global cachedir
     */
    cachedir?: string

    /**
     * Store custom global cachedir by project modIDs
     */
    cachedirs?: {[modID: string]: string}
}

export class Settings {

    private settings: ISettings;

    constructor(settings?: ISettings) {
        this.settings = settings || {};
    }

    /**
     * Load global settings
     * @returns 
     */
    public static async Load() {
        let settings: ISettings = {};
        try {
            const loadPath = join("global-settings.json");
            const content = await readFile(loadPath, 'utf-8');
            settings = JSON.parse(content) as ISettings;
        }
        catch(error) { }
        return new Settings(settings);
    }

    /**
     * Get setting by key
     * @param key 
     * @returns 
     */
    public get(key: string) {
        return this.settings[key];
    }
    
    /**
     * Set setting by key
     * @param key 
     * @param value 
     */
    public set(key: string, value: SettingValue) {
        this.settings[key] = value;
    }

    /**
     * Save current settings
     */
    public async save() {
        const savePath = join("global-settings.json");
        await writeFile(savePath, JSON.stringify(this.settings), 'utf-8');
    }
}
