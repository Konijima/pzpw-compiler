"use strict";
/**
 *  Rewrite of the original compiler.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const colors_1 = require("colors");
const typescript_to_lua_1 = require("typescript-to-lua");
class Compiler {
    static totalErrors = 0;
    args;
    startTime;
    copyright = "";
    cachedir = "";
    pzpwConfig;
    compileType;
    constructor() {
        this.args = process.argv.slice(2);
        this.startTime = new Date().getTime();
        this.compileType = this.args[0];
        this.pzpwConfig = require("../pzpw-config.json");
        this.getCachedir().then(() => {
            this.readHeaderFooter().then(() => this.compile());
        });
    }
    async getCachedir() {
        if ((0, fs_1.existsSync)("./.cachedir")) {
            this.cachedir = await (0, promises_1.readFile)("./.cachedir", { encoding: "utf-8" });
        }
        if (!this.cachedir || this.cachedir == "") {
            this.cachedir = (0, path_1.join)(require('os').homedir(), "Zomboid");
        }
    }
    static print(text) {
        console.log((0, colors_1.green)(`COMPILE: ${text}`));
    }
    static warn(text) {
        console.log((0, colors_1.yellow)(`COMPILE WARNING: ${text}`));
    }
    static error(error) {
        this.totalErrors++;
        console.log((0, colors_1.red)(`COMPILE ERROR: ${error.message}`));
    }
    static FixRequire(lua, modId) {
        if (lua.length === 0)
            return '';
        // Zed regex
        const requireRegex = /require\("(.*)"\)/g;
        const sepRegex = /[.]/g;
        lua = lua.replaceAll(requireRegex, (match) => {
            let str = match.replaceAll(sepRegex, "/"); // Replace dots with slash
            str = str.replaceAll("'", '"'); // Replace single quote to double quotes
            const requireLen = 'require("'.length;
            str = str.replace(str.slice(requireLen, str.indexOf("client/") + "client/".length), ''); // Strip the scope
            str = str.replace(str.slice(requireLen, str.indexOf("server/") + "server/".length), ''); // Strip the scope
            str = str.replace(str.slice(requireLen, str.indexOf("shared/") + "shared/".length), ''); // Strip the scope
            str = (str == `require("PipeWrench")`) ? `require("${modId}/PipeWrench")` : str;
            str = (str == `require("PipeWrench-Events")`) ? `require("${modId}/PipeWrench-Events")` : str;
            str = (str == `require("PipeWrench-Utils")`) ? `require("${modId}/PipeWrench-Utils")` : str;
            // console.log(match, ' to ', str);
            // console.log(str);
            return str;
        });
        return lua;
    }
    async readHeaderFooter() {
        return new Promise(async (resolve) => {
            try {
                this.copyright = await (await (0, promises_1.readFile)("./assets/copyright.txt")).toString();
            }
            catch (error) {
                Compiler.print("No copyright.txt found!");
            }
            return resolve();
        });
    }
    async prepareDir(file) {
        const split = file.split('/');
        let dir = "";
        for (let i = 0; i < split.length; i++) {
            dir = (0, path_1.join)(dir, split[i]);
        }
        await (0, promises_1.mkdir)((0, path_1.dirname)(dir), { recursive: true });
    }
    async prependHeader(file, commentLine = "---") {
        if (this.copyright != "") {
            try {
                const lines = [];
                let headerLines = this.copyright.split("\r\n");
                let content = await (await (0, promises_1.readFile)(file)).toString();
                for (let index in headerLines) {
                    lines.push(commentLine + " " + headerLines[index]);
                }
                content = lines.join("\r\n") + "\r\n\r\n" + content;
                await (0, promises_1.writeFile)(file, content);
            }
            catch (error) {
                Compiler.error(error);
            }
        }
    }
    async copyFile(src, dest) {
        try {
            Compiler.print(`Copying '${src}' to '${dest}'...`);
            await this.prepareDir(dest);
            await (0, promises_1.copyFile)(src, dest);
            if (dest.toLowerCase().endsWith('.lua')) {
                await this.prependHeader(dest);
            }
        }
        catch (error) {
            Compiler.error(error);
        }
    }
    async copyNonCompileFilesInDir(srcDir, destDir) {
        try {
            const files = await (0, promises_1.readdir)(srcDir);
            for (const file of files) {
                if (file.toLowerCase().endsWith('.ts'))
                    continue;
                const path = `${srcDir}/${file}`;
                const lstat = await (0, promises_1.stat)(path);
                if (lstat.isDirectory()) {
                    await this.copyNonCompileFilesInDir(path, path.replace(srcDir, destDir));
                }
                else {
                    await this.copyFile(path, path.replace(srcDir, destDir));
                }
            }
        }
        catch (error) {
            Compiler.error(error);
        }
    }
    async copyNodeModules(src, dest) {
        try {
            await this.prepareDir(dest);
            Compiler.print(`Copying 'node_modules/${src}' to '${dest}'...`);
            await (0, promises_1.copyFile)((0, path_1.resolve)(__dirname, '../node_modules/', src), dest);
        }
        catch (error) {
            Compiler.error(error);
        }
    }
    async compile() {
        try {
            Compiler.print(`Starting ${this.compileType || 'distribution'} compiler...`);
            switch (this.compileType) {
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
                    await this.cleanDistribution();
                    break;
                case "clean-workshop":
                    await this.cleanWorkshop();
                    break;
                default:
                    await this.compileDistribution();
                    break;
            }
        }
        catch (error) {
            Compiler.error(error);
        }
    }
    async cleanDistribution() {
        const modIds = Object.keys(this.pzpwConfig.mods);
        for (let i = 0; i < modIds.length; i++) {
            const modId = modIds[i];
            console.log(`Deleting ${this.cachedir}/mods/${modId}`);
            await (0, promises_1.rm)((0, path_1.join)(this.cachedir, "mods", modId), { force: true, recursive: true });
        }
    }
    async cleanWorkshop() {
        console.log(`Deleting ${this.cachedir}/worshop/${this.pzpwConfig.workshop.title}`);
        await (0, promises_1.rm)((0, path_1.join)(this.cachedir, "workshop", this.pzpwConfig.workshop.title), { force: true, recursive: true });
    }
    async createModInfo(modId) {
        let content = "";
        Object.keys(this.pzpwConfig.mods[modId]).forEach((key) => {
            if (this.pzpwConfig.mods[modId][key] != null) {
                const obj = this.pzpwConfig.mods[modId][key];
                let value;
                if (Array.isArray(obj)) {
                    if (obj.length > 0)
                        value = obj.join(";");
                }
                else
                    value = obj;
                if (value)
                    content += `${key}=${value}\r\n`;
            }
        });
        if (!this.pzpwConfig.mods[modId].icon)
            content += `icon=icon.png\r\n`;
        if (!this.pzpwConfig.mods[modId].poster)
            content += `poster=poster.png\r\n`;
        try {
            await (0, promises_1.writeFile)(`./dist/${modId}/mod.info`, content);
        }
        catch (error) {
            Compiler.error(error);
        }
        ;
    }
    async createWorkshopTxt() {
        let content = "version=1\r\n";
        Object.keys(this.pzpwConfig.workshop).forEach((key) => {
            if (this.pzpwConfig.workshop[key] != null) {
                if (key === "id" && this.pzpwConfig.workshop[key] == -1)
                    return;
                if (key === "mods")
                    return; // ignore the mods array
                let obj = this.pzpwConfig.workshop[key];
                let value;
                if (Array.isArray(obj)) {
                    if (obj.length > 0)
                        value = obj.join(";");
                }
                else
                    value = obj;
                if (value)
                    content += `${key}=${value}\r\n`;
            }
        });
        // Set workshop description
        const description = await (0, promises_1.readFile)("./assets/workshop/description.txt", "utf-8");
        const descriptionLines = description.split("\r\n");
        descriptionLines.forEach(line => {
            content += "description=" + line + "\r\n";
        });
        try {
            await (0, promises_1.writeFile)(`./workshop/workshop.txt`, content);
        }
        catch (error) {
            Compiler.error(error);
        }
        ;
    }
    async postCompile() {
        const timeNow = new Date().getTime();
        const timeDelta = timeNow - this.startTime;
        const timeSeconds = timeDelta / 1000;
        if (Compiler.totalErrors > 0)
            Compiler.print((0, colors_1.magenta)(`Completed compilation in ${timeSeconds} second(s) with ${Compiler.totalErrors} error(s)!`));
        else
            Compiler.print(`Completed compilation in ${timeSeconds} second(s)!`);
    }
    async patchPipeWrenchEvents(filePath, modId) {
        let content = await (0, promises_1.readFile)(filePath, "utf-8");
        content = content.replaceAll(`require("PipeWrench")`, `require("${modId}/PipeWrench")`);
        await (0, promises_1.writeFile)(filePath, content, "utf-8");
    }
    async compileDistribution() {
        const modIds = Object.keys(this.pzpwConfig.mods);
        await (0, promises_1.rm)("./dist", { force: true, recursive: true });
        for (let i = 0; i < modIds.length; i++) {
            const modId = modIds[i];
            const distModDirectory = `./dist/${modId}`;
            await (0, promises_1.mkdir)(distModDirectory, { recursive: true });
            await (0, promises_1.cp)(`./assets/mods/${modId}/media`, `${distModDirectory}/media`, { recursive: true });
            await (0, promises_1.copyFile)(`./assets/mods/${modId}/poster.png`, `${distModDirectory}/poster.png`);
            await (0, promises_1.copyFile)(`./assets/mods/${modId}/icon.png`, `${distModDirectory}/icon.png`);
            await this.createModInfo(modId);
            await this.copyNonCompileFilesInDir(`./src/${modId}/client`, `${distModDirectory}/media/lua/client`);
            await this.copyNonCompileFilesInDir(`./src/${modId}/server`, `${distModDirectory}/media/lua/server`);
            await this.copyNonCompileFilesInDir(`./src/${modId}/shared`, `${distModDirectory}/media/lua/shared`);
            await this.copyNodeModules("PipeWrench/PipeWrench.lua", `${distModDirectory}/media/lua/shared/${modId}/PipeWrench.lua`);
            await this.copyNodeModules("PipeWrench-Events/PipeWrench-Events.lua", `${distModDirectory}/media/lua/shared/${modId}/PipeWrench-Events.lua`);
            await this.copyNodeModules("PipeWrench-Utils/PipeWrench-Utils.lua", `${distModDirectory}/media/lua/shared/${modId}/PipeWrench-Utils.lua`);
            await this.patchPipeWrenchEvents(`${distModDirectory}/media/lua/shared/${modId}/PipeWrench-Events.lua`, modId);
        }
        (0, typescript_to_lua_1.transpileProject)('tsconfig.json', { emitDeclarationOnly: false }, async (fileName, lua, _writeByteOrderMark, _onError) => {
            if (lua.length === 0)
                return; // Ignore empty files.
            if (fileName.endsWith('.d.ts'))
                return; // Ignore d.ts files
            fileName = fileName.replace((0, path_1.join)(__dirname, "../"), ""); // Remove base directory
            fileName = fileName.split('\\').join('/'); // Fix backslashes
            const splits = fileName.split('/');
            const multiMods = splits.length > 1 && !["client", "server", "shared"].includes(splits[0]);
            // handle lualib_bundle
            if (splits[0] == "lualib_bundle.lua") {
                for (let i = 0; i < modIds.length; i++) {
                    const modId = modIds[i];
                    await (0, promises_1.writeFile)((0, path_1.join)(__dirname, '../', `dist/${modId}/media/lua/shared/lualib_bundle.lua`), lua);
                }
                return;
            }
            let scope = (multiMods ? splits[1] : splits[0]);
            let modId = multiMods ? splits.shift() : modIds[0];
            let filepath = splits.slice(1).join('/');
            console.log(scope, modId, filepath, fileName);
            if (!modIds.includes(modId))
                return; // modId must be configurated in pzpw-config.json
            lua = Compiler.FixRequire(lua, modId);
            // lua = lua.replaceAll("prototype.", ""); // Cannot remove prototype, need a new way of overwriting lua code
            lua = this.applyReimportScript(lua);
            const outPath = (0, path_1.join)(__dirname, `../dist/${modId}/media/lua/${scope}/${filepath}`);
            await this.prepareDir(outPath);
            await (0, promises_1.writeFile)(outPath, lua);
            await this.prependHeader(outPath);
        });
        // Copy distribution files to /Zomboid/mods
        for (let i = 0; i < modIds.length; i++) {
            const modId = modIds[i];
            console.log(`Copying distribution mod into cachedir ${this.cachedir}/mods/`);
            await (0, promises_1.cp)(`./dist/${modId}`, (0, path_1.join)(this.cachedir, "mods", modId), { recursive: true, force: true });
        }
        await this.postCompile();
    }
    async compileDevelopment() {
        throw new Error("Not implemented yet!");
    }
    async compileDeclaration() {
        const modIds = Object.keys(this.pzpwConfig.mods);
        await (0, promises_1.rm)("./dts", { force: true, recursive: true });
        await (0, promises_1.mkdir)("./dts");
        for (let i = 0; i < modIds.length; i++) {
            const modId = modIds[i];
            const declarationFile = `./dts/${modId}.d.ts`;
            await (0, promises_1.writeFile)(declarationFile, "");
            await this.prependHeader(declarationFile, "//");
        }
        (0, typescript_to_lua_1.transpileProject)('tsconfig.json', { removeComments: true, emitDeclarationOnly: true }, async (fileName, declaration, _writeByteOrderMark, _onError) => {
            if (declaration.length === 0)
                return;
            if (fileName.includes("/client/"))
                fileName = fileName.slice(fileName.indexOf("/client/") + 8);
            if (fileName.includes("/server/"))
                fileName = fileName.slice(fileName.indexOf("/server/") + 8);
            if (fileName.includes("/shared/"))
                fileName = fileName.slice(fileName.indexOf("/shared/") + 8);
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
            await (0, promises_1.appendFile)(`./dts/${modId}.d.ts`, lines.join("\r\n"));
        });
        await this.postCompile();
    }
    async compileWorkshop() {
        await this.compileDistribution();
        await (0, promises_1.rm)("./workshop", { force: true, recursive: true });
        await (0, promises_1.mkdir)("./workshop");
        await (0, promises_1.copyFile)("./assets/workshop/preview.png", `./workshop/preview.png`);
        await this.createWorkshopTxt();
        for (let i = 0; i < this.pzpwConfig.workshop.mods.length; i++) {
            const modId = this.pzpwConfig.workshop.mods[i];
            const distModDirectory = `./dist/${modId}`;
            const workshopModDirectory = `./workshop/Contents/mods/${modId}`;
            await (0, promises_1.cp)(`${distModDirectory}`, `${workshopModDirectory}`, { recursive: true });
        }
        console.log(`Copying workshop mod into cachedir ${this.cachedir}/worshop/`);
        await (0, promises_1.cp)(`./workshop`, (0, path_1.join)(this.cachedir, "workshop", this.pzpwConfig.workshop.title), { recursive: true, force: true });
    }
    REIMPORT_TEMPLATE = `-- PIPEWRENCH --
if _G.Events.OnPipeWrenchBoot == nil then
  _G.triggerEvent('OnPipeWrenchBoot', false)
end
_G.Events.OnPipeWrenchBoot.Add(function(____flag____)
  if ____flag____ ~= true then return end
  -- {IMPORTS}
end)
----------------`;
    applyReimportScript(lua) {
        const assignments = [];
        const lines = lua.split('\n');
        // Look for any PipeWrench assignments.
        for (const line of lines) {
            if (line.indexOf('local ') === 0 && line.indexOf('____PipeWrench.') !== -1) {
                assignments.push(line.replace('local ', ''));
            }
        }
        // Only generate a reimport codeblock if there's anything to import.
        if (!assignments.length)
            return lua;
        // Take out the returns statement so we can insert before it.
        lines.pop();
        const returnLine = lines.pop();
        lines.push('');
        // Build the reimport event.
        let compiledImports = '';
        for (const assignment of assignments)
            compiledImports += `${assignment}\n`;
        const reimports = this.REIMPORT_TEMPLATE.replace('-- {IMPORTS}', compiledImports.substring(0, compiledImports.length - 1));
        return `${lines.join('\n')}\n${reimports}\n\n${returnLine}\n`;
    }
}
new Compiler();
