/**
 *  Rewrite of the original compiler.
 */

import { existsSync } from "fs";
import { copyFile, cp, appendFile, rm, mkdir, readFile, writeFile, readdir, stat } from "fs/promises";
import { dirname, join, resolve } from "path";
import { green, magenta, red, yellow } from 'colors';
import { transpileProject } from 'typescript-to-lua';

type Scope = 'client' | 'server' | 'shared';
type Visibility = 'public' | 'hidden' | 'unlisted';
type CompileType = "distribution" | "development" | "declaration" | "workshop" | "clean-distribution" | "clean-workshop";

interface ModConfig {
    id: string
    name: string
    description: string
    poster?: string
    icon?: string
    require?: string | string[]
    pack?: string
    tiledef?: string
    [key: string]: any
}

interface WorkshopConfig {
    id: number
    title: string
    mods: string[]
    visibility: Visibility
    author?: string | string[]
    tags?: string[]
    [key: string]: any
}

interface RootConfig {
    mods: { [id: string]: ModConfig },
    workshop: WorkshopConfig,
    typings: { [key: string]: string }
}

class Compiler {

    public static totalErrors: number = 0;

    private args: string[];
    private startTime: number;
    private copyright: string = "";
    private cachedir: string = "";
    private pzpwConfig: RootConfig;
    readonly compileType: CompileType;

    constructor() {
        this.args = process.argv.slice(2);
        this.startTime = new Date().getTime();
        this.compileType = this.args[0] as CompileType;
        this.pzpwConfig = require("../pzpw-config.json");
        this.getCachedir().then(() => {
            this.readHeaderFooter().then(() => this.compile());
        });
    }

    private async getCachedir() {
        if (existsSync("./.cachedir")) {
            this.cachedir = await readFile("./.cachedir", { encoding: "utf-8" });
        }
        if (!this.cachedir || this.cachedir == "") {
            this.cachedir = join(require('os').homedir(), "Zomboid");
        }
    }

    public static print(text: string) {
        console.log(green(`COMPILE: ${text}`));
    }

    public static warn(text: string) {
        console.log(yellow(`COMPILE WARNING: ${text}`));
    }

    public static error(error: Error) {
        this.totalErrors++;
        console.log(red(`COMPILE ERROR: ${error.message}`));
    }

    public static FixRequire(lua: string, modId: string) {
        if (lua.length === 0) return '';

        // Zed regex
        const requireRegex = /require\("(.*)"\)/g;
        const sepRegex = /[.]/g;

        lua = lua.replaceAll(requireRegex, (match) => {
            let str = match.replaceAll(sepRegex, "/") // Replace dots with slash
            str = str.replaceAll("'", '"') // Replace single quote to double quotes

            const requireLen = 'require("'.length;
            str = str.replace(str.slice(requireLen, str.indexOf("client/") + "client/".length), '') // Strip the scope
            str = str.replace(str.slice(requireLen, str.indexOf("server/") + "server/".length), '') // Strip the scope
            str = str.replace(str.slice(requireLen, str.indexOf("shared/") + "shared/".length), '') // Strip the scope
            
            str = (str == `require("PipeWrench")`) ? `require("${modId}/PipeWrench")` : str;
            str = (str == `require("PipeWrench-Events")`) ? `require("${modId}/PipeWrench-Events")` : str;
            str = (str == `require("PipeWrench-Utils")`) ? `require("${modId}/PipeWrench-Utils")` : str;

            // console.log(match, ' to ', str);
            // console.log(str);
            return str;
        });

        return lua;
    }

    private async readHeaderFooter() {
        return new Promise(async (resolve: any) => {
            try {
                this.copyright = await (await readFile("./assets/copyright.txt")).toString();
            }
            catch(error) { Compiler.print("No copyright.txt found!"); }
            return resolve();
        });
    }

    private async prepareDir(file: string) {
        const split = file.split('/');
        let dir: string = "";
        for (let i = 0; i < split.length; i++) {
            dir = join(dir, split[i]);
        }
        await mkdir(dirname(dir), { recursive: true });
    }

    private async prependHeader(file: string, commentLine: string = "---") {
        if (this.copyright != "") {
            try {
                const lines: string[] = [];
                let headerLines: string[] = this.copyright.split("\r\n");
                let content = await (await readFile(file)).toString();
                for (let index in headerLines) {
                    lines.push(commentLine + " " + headerLines[index]);
                }
                content = lines.join("\r\n") + "\r\n\r\n" + content;
                await writeFile(file, content);
            }
            catch(error) { Compiler.error(error); }
        }
    }

    private async copyFile(src: string, dest: string) {
        try {
            Compiler.print(`Copying '${src}' to '${dest}'...`);
            await this.prepareDir(dest);
            await copyFile(src, dest);
            
            if (dest.toLowerCase().endsWith('.lua')) {
                await this.prependHeader(dest);
            }
        }
        catch(error) { Compiler.error(error); }
    }

    private async copyNonCompileFilesInDir(srcDir: string, destDir: string) {
        try {
            const files = await readdir(srcDir);
            for (const file of files) {
                if (file.toLowerCase().endsWith('.ts')) continue;
                const path = `${srcDir}/${file}`;
                const lstat = await stat(path);
                if (lstat.isDirectory()) {
                    await this.copyNonCompileFilesInDir(path, path.replace(srcDir, destDir));
                } else {
                    await this.copyFile(path, path.replace(srcDir, destDir));
                }
            }
        }
        catch(error) { Compiler.error(error); }
    }

    private async copyNodeModules(src: string, dest: string) {
        try {
            await this.prepareDir(dest);
            Compiler.print(`Copying 'node_modules/${src}' to '${dest}'...`);
            await copyFile(resolve(__dirname, '../node_modules/', src), dest);
        }
        catch(error) { Compiler.error(error); }
    }
 
    private async compile() {
        try {
            Compiler.print(`Starting ${this.compileType || 'distribution'} compiler...`);
            switch(this.compileType) {
                case "development":
                    await this.compileDevelopment();
                    break;
                case "declaration":
                    await this.compileDeclaration();
                    break;
                case "workshop":
                    await this.compileWorkshop();
                    break;
                case "clean-distribution":
                    await this.cleanDistribution()
                    break;
                case "clean-workshop":
                    await this.cleanWorkshop()
                    break;
                default:
                    await this.compileDistribution();
                    break;
            }
        }
        catch(error) { Compiler.error(error); }
    }

    private async cleanDistribution() {
        const modIds = Object.keys(this.pzpwConfig.mods);
        for (let i = 0; i < modIds.length; i++) {
            const modId = modIds[i];

            console.log(`Deleting ${this.cachedir}/mods/${modId}`);
            await rm(join(this.cachedir, "mods", modId), { force: true, recursive: true });
        }
    }

    private async cleanWorkshop() {
        console.log(`Deleting ${this.cachedir}/worshop/${this.pzpwConfig.workshop.title}`);
        await rm(join(this.cachedir, "workshop", this.pzpwConfig.workshop.title), { force: true, recursive: true });
    }

    private async createModInfo(modId: string) {
        let content = "";
        
        Object.keys(this.pzpwConfig.mods[modId]).forEach((key: string) => {
            if (this.pzpwConfig.mods[modId][key] != null) {
                
                const obj = this.pzpwConfig.mods[modId][key];
                let value;
                if (Array.isArray(obj)) {
                    if (obj.length > 0) value = obj.join(";");
                }
                else value = obj;

                if (value) content += `${key}=${value}\r\n`;
            }
        });

        if (!this.pzpwConfig.mods[modId].icon) content += `icon=icon.png\r\n`;
        if (!this.pzpwConfig.mods[modId].poster) content += `poster=poster.png\r\n`;

        try { await writeFile(`./dist/${modId}/mod.info`, content); } catch(error) {
            Compiler.error(error);
        };
    }

    private async createWorkshopTxt() {
        let content = "version=1\r\n";
        
        Object.keys(this.pzpwConfig.workshop).forEach((key: string) => {
            if (this.pzpwConfig.workshop[key] != null) {
                if (key === "id" && this.pzpwConfig.workshop[key] == -1 ) return;
                if (key === "mods") return; // ignore the mods array

                let obj = this.pzpwConfig.workshop[key];
                let value;
                if (Array.isArray(obj)) {
                    if (obj.length > 0) value = obj.join(";");
                }
                else value = obj;

                if (value) content += `${key}=${value}\r\n`;
            }
        });

        // Set workshop description
        const description: string = await readFile("./assets/workshop/description.txt", "utf-8");
        const descriptionLines = description.split("\r\n");
        descriptionLines.forEach(line => {
            content += "description=" + line + "\r\n";
        });

        try { await writeFile(`./workshop/workshop.txt`, content); } catch(error) {
            Compiler.error(error);
        };
    }

    private async postCompile() {
        const timeNow = new Date().getTime();
        const timeDelta = timeNow - this.startTime;
        const timeSeconds = timeDelta / 1000;

        if (Compiler.totalErrors > 0) Compiler.print(magenta(`Completed compilation in ${timeSeconds} second(s) with ${Compiler.totalErrors} error(s)!`));
        else Compiler.print(`Completed compilation in ${timeSeconds} second(s)!`);
    }

    private async patchPipeWrenchEvents(filePath, modId) {
        let content = await readFile(filePath, "utf-8");
        content = content.replaceAll(`require("PipeWrench")`, `require("${modId}/PipeWrench")`);
        await writeFile(filePath, content, "utf-8");
    }

    private async compileDistribution() {
        const modIds = Object.keys(this.pzpwConfig.mods);

        await rm("./dist", { force: true, recursive: true });

        for (let i = 0; i < modIds.length; i++) {
            const modId = modIds[i];

            const distModDirectory = `./dist/${modId}`;
            await mkdir(distModDirectory, { recursive: true });
            await cp(`./assets/mods/${modId}/media`, `${distModDirectory}/media`, { recursive: true });
            await copyFile(`./assets/mods/${modId}/poster.png`, `${distModDirectory}/poster.png`);
            await copyFile(`./assets/mods/${modId}/icon.png`, `${distModDirectory}/icon.png`);
    
            await this.createModInfo(modId);
            await this.copyNonCompileFilesInDir(`./src/${modId}/client`, `${distModDirectory}/media/lua/client`);
            await this.copyNonCompileFilesInDir(`./src/${modId}/server`, `${distModDirectory}/media/lua/server`);
            await this.copyNonCompileFilesInDir(`./src/${modId}/shared`, `${distModDirectory}/media/lua/shared`);
            await this.copyNodeModules("PipeWrench/PipeWrench.lua", `${distModDirectory}/media/lua/shared/${modId}/PipeWrench.lua`);
            await this.copyNodeModules("PipeWrench-Events/PipeWrench-Events.lua", `${distModDirectory}/media/lua/shared/${modId}/PipeWrench-Events.lua`);
            await this.copyNodeModules("PipeWrench-Utils/PipeWrench-Utils.lua", `${distModDirectory}/media/lua/shared/${modId}/PipeWrench-Utils.lua`);
        
            await this.patchPipeWrenchEvents(`${distModDirectory}/media/lua/shared/${modId}/PipeWrench-Events.lua`, modId);
        }

        transpileProject('tsconfig.json', { emitDeclarationOnly: false }, 
        async (fileName: string, lua: string, _writeByteOrderMark: boolean, _onError?: (message: string) => void) => {
            if(lua.length === 0) return; // Ignore empty files.
            if (fileName.endsWith('.d.ts')) return; // Ignore d.ts files
            fileName = fileName.replace(join(__dirname, "../"), ""); // Remove base directory
            fileName = fileName.split('\\').join('/'); // Fix backslashes

            const splits = fileName.split('/');
            const multiMods = splits.length > 1 && !["client", "server", "shared"].includes(splits[0]);

            // handle lualib_bundle
            if (splits[0] == "lualib_bundle.lua") {
                for (let i = 0; i < modIds.length; i++) {
                    const modId = modIds[i];
                    await writeFile(join(__dirname, '../', `dist/${modId}/media/lua/shared/lualib_bundle.lua`), lua);
                }
                return;
            }

            let scope = (multiMods ? splits[1] : splits[0]) as Scope;
            let modId = multiMods ? splits.shift() : modIds[0];
            let filepath = splits.slice(1).join('/');

            console.log(scope, modId, filepath, fileName)

            if (!modIds.includes(modId)) return; // modId must be configurated in pzpw-config.json

            lua = Compiler.FixRequire(lua, modId);
            // lua = lua.replaceAll("prototype.", ""); // Cannot remove prototype, need a new way of overwriting lua code
            lua = this.applyReimportScript(lua);

            const outPath = join(__dirname, `../dist/${modId}/media/lua/${scope}/${filepath}`);
            await this.prepareDir(outPath);
            await writeFile(outPath, lua);
            await this.prependHeader(outPath);
        });
        
        // Copy distribution files to /Zomboid/mods
        for (let i = 0; i < modIds.length; i++) {
            const modId = modIds[i];

            console.log(`Copying distribution mod into cachedir ${this.cachedir}/mods/`);
            await cp(`./dist/${modId}`, join(this.cachedir, "mods", modId), { recursive: true, force: true });
        }
        
        await this.postCompile();
    }

    private async compileDevelopment() {
        throw new Error("Not implemented yet!");
    }

    private async compileDeclaration() {
        const modIds = Object.keys(this.pzpwConfig.mods);

        await rm("./dts", { force: true, recursive: true });
        await mkdir("./dts");

        for (let i = 0; i < modIds.length; i++) {
            const modId = modIds[i];
            const declarationFile = `./dts/${modId}.d.ts`;

            await writeFile(declarationFile, "");
            await this.prependHeader(declarationFile, "//");
        }

        transpileProject('tsconfig.json', { removeComments: true, emitDeclarationOnly: true }, 
        async (fileName: string, declaration: string, _writeByteOrderMark: boolean, _onError?: (message: string) => void) => {
            if(declaration.length === 0) return;

            if (fileName.includes("/client/")) fileName = fileName.slice(fileName.indexOf("/client/") + 8);
            if (fileName.includes("/server/")) fileName = fileName.slice(fileName.indexOf("/server/") + 8);
            if (fileName.includes("/shared/")) fileName = fileName.slice(fileName.indexOf("/shared/") + 8);

            const splits = fileName.split("/");
            const modId = splits.shift();
            const filepath = splits.join('/');

            const lines = declaration.split("\r\n");
            lines.forEach((line, index) => {
                lines[index] = "    " + lines[index];
                lines[index] = lines[index].replace("declare ", "");
            });
            lines.pop();
            lines.push(`}\r\n\r\n`);
            lines.unshift(`declare module "${modId}" {`);
            lines.unshift(`/** [${filepath.replace(".d.ts", "")}] */`);

            await appendFile(`./dts/${modId}.d.ts`, lines.join("\r\n"));
        });

        await this.postCompile();
    }

    private async compileWorkshop() {
        await this.compileDistribution();

        await rm("./workshop", { force: true, recursive: true });
        await mkdir("./workshop");
        await copyFile("./assets/workshop/preview.png", `./workshop/preview.png`);
        await this.createWorkshopTxt();
        
        for (let i = 0; i < this.pzpwConfig.workshop.mods.length; i++) {
            const modId = this.pzpwConfig.workshop.mods[i];

            const distModDirectory = `./dist/${modId}`;
            const workshopModDirectory = `./workshop/Contents/mods/${modId}`;
    
            await cp(`${distModDirectory}`, `${workshopModDirectory}`, { recursive: true });
        }

        console.log(`Copying workshop mod into cachedir ${this.cachedir}/worshop/`);
        await cp(`./workshop`, join(this.cachedir, "workshop", this.pzpwConfig.workshop.title), { recursive: true, force: true });
    }

    private readonly REIMPORT_TEMPLATE = `-- PIPEWRENCH --
if _G.Events.OnPipeWrenchBoot == nil then
  _G.triggerEvent('OnPipeWrenchBoot', false)
end
_G.Events.OnPipeWrenchBoot.Add(function(____flag____)
  if ____flag____ ~= true then return end
  -- {IMPORTS}
end)
----------------`;

    private applyReimportScript(lua: string) {
        const assignments: string[] = [];
        const lines = lua.split('\n');

        // Look for any PipeWrench assignments.
        for (const line of lines) {
            if (line.indexOf('local ') === 0 && line.indexOf('____PipeWrench.') !== -1) {
            assignments.push(line.replace('local ', ''));
            }
        }

        // Only generate a reimport codeblock if there's anything to import.
        if (!assignments.length) return lua;

        // Take out the returns statement so we can insert before it.
        lines.pop();
        const returnLine: string = lines.pop() as string;
        lines.push('');

        // Build the reimport event.
        let compiledImports = '';
        for (const assignment of assignments) compiledImports += `${assignment}\n`;
        const reimports = this.REIMPORT_TEMPLATE.replace(
            '-- {IMPORTS}',
            compiledImports.substring(0, compiledImports.length - 1)
        );

        return `${lines.join('\n')}\n${reimports}\n\n${returnLine}\n`;
    }

}

new Compiler();
