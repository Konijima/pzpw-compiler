import { join, resolve } from "path";
import { readdir, readFile } from "fs/promises";

/**
 * Root directory of the running process
 */
export const APP_PATH = resolve(process.argv[1], "../../");

/**
 * Read pzpw-compiler package.json
 * @returns 
 */
export async function getPackageJson() {
    const filePath = join(APP_PATH, "package.json");
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
}

/**
 * Read and parse pzpw-config.json
 * @param basePath base path to search for pzpw-config.json
 * @returns object
 */
export async function getPZPWConfig() {
    const filePath = join("pzpw-config.json");
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
}

/**
 * Read the INTRO.txt file
 * @returns 
 */
export async function getIntro() {
    const { author, version } = await getPackageJson();
    const filePath = join(APP_PATH, "INTRO.txt");
    return (await readFile(filePath, 'utf-8'))
        .replaceAll('{author}', author)
        .replaceAll('{version}', version);
}

/**
 * Get help text
 * @returns 
 */
export async function getHelp() {
    let result = ["AVAILABLE COMMANDS:\n"];
    const helpDir = join(APP_PATH, "help");
    const files = await readdir(helpDir);
    for (const file of files) {
        const command = file.replace(".txt", "");
        const line = `${command} - ${await getCommandHelp(file.replace(".txt", ""), false)}`;
        result.push(line.trim());
    }
    return result.join("\n");
}

/**
 * Get command help text
 * @returns 
 */
export async function getCommandHelp(commandName: string, full: boolean = false) {
    const content = await readFile(join(APP_PATH, "help", commandName + '.txt'), 'utf-8');
    return (full) ? content.replace("::FULL::", "").trim() : content.slice(0, content.indexOf("::FULL::")).trim();
}
