import { join } from "path";
import { readFile } from "fs/promises";

/**
 * Async function to read and parse pzpw-config.json
 * @param basePath base path to search for pzpw-config.json
 * @returns object
 */
export async function getPZPWConfig(basePath: string = "") {
    const filePath = join(basePath, "pzpw-config.json");
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
}

/**
 * Async function to read the INTRO.txt file
 * @returns 
 */
export async function getIntro() {
    const filePath = join("INTRO.txt");
    return await readFile(filePath, 'utf-8');
}

/**
 * Async function to read the HELP.txt file
 * @returns 
 */
export async function getHelp() {
    const filePath = join("HELP.txt");
    return await readFile(filePath, 'utf-8');
}
