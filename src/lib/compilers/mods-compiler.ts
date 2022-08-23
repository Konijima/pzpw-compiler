import chalk from "chalk";
import { basename, dirname, join } from "path";
import { copyFile, mkdir, readdir, rm, writeFile } from "fs/promises";
import { transpile } from "../transpiler.js";
import { APP_PATH, copyDirRecursiveTo, copyFileRecursiveTo } from "../utils.js";

async function generateModInfo(pzpwConfig: any, modId: string) {
    console.log(chalk.yellowBright(`- Generating 'dist/${modId}/mod.info'...`));
    
    let content = "";
    Object.keys(pzpwConfig.mods[modId]).forEach((key: string) => {
        if (pzpwConfig.mods[modId][key] != null) {
            const obj = pzpwConfig.mods[modId][key];
            let value;
            if (Array.isArray(obj)) {
                if (obj.length > 0) value = obj.join(";");
            }
            else value = obj;

            if (value) content += `${key}=${value}\r\n`;
        }
    });

    if (!pzpwConfig.mods[modId].icon) content += "icon=icon.png\r\n";
    if (!pzpwConfig.mods[modId].poster) content += "poster=poster.png\r\n";

    await writeFile(join("dist", modId, "mod.info"), content)
        .catch(() => console.error(chalk.red(`Error while writing 'dist/${modId}/mod.info'`)));
}

/**
 * Fix the requires
 */
function fixRequire(modId: string, lua: string) {
    if (lua.length === 0) return "";

    // Zed regex
    const requireRegex = /require\("(.*)"\)/g;
    const sepRegex = /[.]/g;

    lua = lua.replaceAll(requireRegex, (match) => {
        let str = match.replaceAll(sepRegex, "/"); // Replace dots with slash
        str = str.replaceAll("'", "\""); // Replace single quote to double quotes

        const requireLen = "require(\"".length;
        str = str.replace(str.slice(requireLen, str.indexOf("client/") + "client/".length), ""); // Strip the scope
        str = str.replace(str.slice(requireLen, str.indexOf("server/") + "server/".length), ""); // Strip the scope
        str = str.replace(str.slice(requireLen, str.indexOf("shared/") + "shared/".length), ""); // Strip the scope
        
        str = (str == "require(\"lualib_bundle\")") ? `require("${modId}/lualib_bundle")` : str;
        str = (str == "require(\"PipeWrench\")") ? `require("${modId}/PipeWrench")` : str;
        str = (str == "require(\"PipeWrench-Events\")") ? `require("${modId}/PipeWrench-Events")` : str;
        str = (str == "require(\"PipeWrench-Utils\")") ? `require("${modId}/PipeWrench-Utils")` : str;
        return str;
    });

    return lua;
}

/**
 * Compile mods into dist directory
 * @param pzpwConfig 
 * @param modIds 
 */
export async function ModsCompiler(pzpwConfig: any, modIds: string[], cachedir: string) {
    // Transpile typescript
    console.log(chalk.yellowBright(`- Transpiling ${modIds.length} mod(s)...`));
    const transpileResult = await transpile(modIds);
    console.log(chalk.yellowBright(`- Transpiled ${Object.keys(transpileResult).length} typescript file(s)! `));

    // Prepare dist directory
    console.log(chalk.yellowBright("- Deleting directory 'dist'..."));
    await rm("dist", { force: true, recursive: true });
    for (const modId of modIds) {
        console.log(chalk.yellowBright(`- Creating directory 'dist/${modId}'...`));
        await mkdir(join("dist", modId), { recursive: true });
    }

    // Generate mod.info
    for (const modId of modIds) {
        await generateModInfo(pzpwConfig, modId);
    }

    // Copy images
    for (const modId of modIds) {
        const modSourceDir = join("assets", "mods", modId);
        const files = await readdir(modSourceDir);
        for (const file of files) {
            if (file.toLowerCase().endsWith(".png")) {
                console.log(chalk.yellowBright(`- Copying mod image '${basename(file)}' to 'dist/${modId}/${basename(file)}'...`));
                copyFile(join(modSourceDir, file), join("dist", modId, basename(file)));
            }
        }
    }

    // Copy media
    for (const modId of modIds) {
        const mediaSourceDir = join("assets", "mods", modId, "media");
        const mediaDestDir = join("dist", modId, "media");
        console.log(chalk.yellowBright(`- Copying assets 'media' to 'dist/${modId}/media/'...`));
        copyDirRecursiveTo(mediaSourceDir, mediaDestDir, [".ts", ".gitkeep"]);
    }
    
    // Copy source files
    for (const modId of modIds) {
        const mediaSourceDir = join("src", modId);
        const mediaDestDir = join("dist", modId, "media", "lua");
        console.log(chalk.yellowBright(`- Copying source files to 'dist/${modId}/media/lua/'...`));
        copyDirRecursiveTo(mediaSourceDir, mediaDestDir, [".ts", ".gitkeep"]);
    }

    // Add transpiled lua
    for (const fileName of Object.keys(transpileResult)) {
        if (fileName.startsWith("src/")) {
            const split = fileName.replace("src/", "").split("/");

            const modId = split[0];                         // grab modId
            split.shift();                                  // remove modId
            let filePath = split.shift();                   // add scope
            
            filePath = join(filePath, split.join("/"));     // add modId and the rest

            const luaOutPath = join("dist", modId, "media", "lua", filePath.replace(".ts", ".lua"));
            const content = fixRequire(modId, transpileResult[fileName]);

            console.log(chalk.yellowBright(`- Copying lua '${fileName}' to '${luaOutPath}'`));
            await mkdir(dirname(luaOutPath), { recursive: true });
            await writeFile(luaOutPath, content);
        }
    }

    // Copy lualib_bundle
    for (const modId of modIds) {
        const mediaSource = join(APP_PATH, "node_modules/typescript-to-lua/dist/lualib/lualib_bundle.lua");
        const mediaDest = join("dist", modId, "media", "lua", "shared", modId, "lualib_bundle.lua");
        console.log(chalk.yellowBright(`- Copying 'lualib_bundle' to 'dist/${modId}/media/lua/shared/${modId}/'...`));
        copyFileRecursiveTo(mediaSource, mediaDest);
    }

    // Copy PipeWrench
    for (const modId of modIds) {
        const mediaSource = "node_modules/PipeWrench/PipeWrench.lua";
        const mediaDest = join("dist", modId, "media", "lua", "shared", modId, "PipeWrench.lua");
        console.log(chalk.yellowBright(`- Copying 'PipeWrench' to 'dist/${modId}/media/lua/shared/${modId}/'...`));
        copyFileRecursiveTo(mediaSource, mediaDest, (content: string) => fixRequire(modId, content));
    }

    // Copy PipeWrench-Events
    for (const modId of modIds) {
        const mediaSource = "node_modules/PipeWrench-Events/PipeWrench-Events.lua";
        const mediaDest = join("dist", modId, "media", "lua", "shared", modId, "PipeWrench-Events.lua");
        console.log(chalk.yellowBright(`- Copying 'PipeWrench-Events' to 'dist/${modId}/media/lua/shared/${modId}/'...`));
        copyFileRecursiveTo(mediaSource, mediaDest, (content: string) => fixRequire(modId, content));
    }

    // Copy PipeWrench-Utils
    for (const modId of modIds) {
        const mediaSource = "node_modules/PipeWrench-Utils/PipeWrench-Utils.lua";
        const mediaDest = join("dist", modId, "media", "lua", "shared", modId, "PipeWrench-Utils.lua");
        console.log(chalk.yellowBright(`- Copying 'PipeWrench-Utils' to 'dist/${modId}/media/lua/shared/${modId}/'...`));
        copyFileRecursiveTo(mediaSource, mediaDest, (content: string) => fixRequire(modId, content));
    }

    // Copy generated workshop directory to cachedir
    for (const modId of modIds) {
        const inPath = join("dist", modId);
        const cachedirOut = join(cachedir, "mods", modId);
        console.log(chalk.yellowBright(`- Copying '${inPath}' to '${cachedirOut}'...`));
        copyDirRecursiveTo(inPath, cachedirOut);
    }
}
