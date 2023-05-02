import { PZPWConfig } from "pzpw-config-schema";
import { dirname, extname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "fs/promises";
import ts from "typescript";

/**
 * Root directory of the running process
 */
export const APP_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../../");

/**
 * Read pzpw-compiler package.json
 * @returns
 */
export async function getPackageJson() {
  const filePath = join(APP_PATH, "package.json");
  const content = await readFile(filePath, "utf-8");
  return JSON.parse(content);
}

/**
 * Read and parse pzpw-config.json
 * @param basePath base path to search for pzpw-config.json
 * @returns object
 */
export async function getPZPWConfig(): Promise<PZPWConfig> {
  const filePath = join("pzpw-config.json");
  const content = await readFile(filePath, "utf-8");
  return JSON.parse(content) as PZPWConfig;
}

/**
 * Read the INTRO.txt file
 * @returns
 */
export async function getIntro() {
  const { author, version, contributors } = await getPackageJson();
  const filePath = join(APP_PATH, "INTRO.txt");
  return (await readFile(filePath, "utf-8"))
    .replaceAll("{author}", author)
    .replaceAll("{contributors}", contributors.join(", "))
    .replaceAll("{version}", version);
}

/**
 * Get help text
 * @returns
 */
export async function getHelp() {
  const result = ["AVAILABLE COMMANDS:\n"];
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
export async function getCommandHelp(commandName: string, full = false) {
  const content = await readFile(join(APP_PATH, "help", commandName + ".txt"), "utf-8");
  return full ? content.replace("::FULL::", "").trim() : content.slice(0, content.indexOf("::FULL::")).trim();
}

/**
 * Copy files recursively to a destination
 * @param sourceDirectory the source directory
 * @param destinationDirectory the destination directory
 * @param ignoreExtentions array of extention to ignore
 */
export async function copyDirRecursiveTo(
  sourceDirectory: string,
  destinationDirectory: string,
  ignoreExtentions: string[] = [],
) {
  const files = await readdir(sourceDirectory);
  for (const file of files) {
    const path = join(sourceDirectory, file);
    const lstat = await stat(path);
    if (lstat.isDirectory()) {
      await copyDirRecursiveTo(path, path.replace(sourceDirectory, destinationDirectory), ignoreExtentions);
    } else {
      if (file.startsWith(".") || ignoreExtentions.includes(extname(file))) continue;
      const dest = path.replace(sourceDirectory, destinationDirectory);
      await mkdir(dirname(dest), { recursive: true });
      await copyFile(path, dest);
    }
  }
}

/**
 * Copy a file and ensure the directories are created recursively, optionally transform it's content
 * @param sourceDirectory
 * @param destinationDirectory
 * @param transform
 */
export async function copyFileRecursiveTo(
  sourceDirectory: string,
  destinationDirectory: string,
  transform?: (content: string) => string,
) {
  await mkdir(dirname(destinationDirectory), { recursive: true });
  if (transform) {
    let content = await readFile(sourceDirectory, "utf-8");
    content = transform(content);
    await writeFile(destinationDirectory, content);
  } else await copyFile(sourceDirectory, destinationDirectory);
}

/**
 * Separate array by predicate and return tuple
 * @param {T[]} arr
 * @param {(v: T, i: number, ar: T[]) => boolean} predicate
 * @returns {T}
 */
export function partitionBy<T>(arr: T[], predicate: (v: T, i: number, ar: T[]) => boolean) {
  return arr.reduce(
    (acc, item, index, array) => {
      acc[+!predicate(item, index, array)].push(item);
      return acc;
    },
    [[], []] as [T[], T[]],
  );
}

/**
 * Get tscondig entity
 * @param {string} searchPath
 * @param {string} configName
 * @returns {ts.ParsedCommandLine}
 */
export function getTsConfig(searchPath = "./", configName = "tsconfig.json") {
  const configFileName = ts.findConfigFile(searchPath, ts.sys.fileExists, configName);
  const configFile = ts.readConfigFile(configFileName, ts.sys.readFile);
  return ts.parseJsonConfigFileContent(configFile.config, ts.sys, "./");
}
