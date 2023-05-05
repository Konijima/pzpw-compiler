import { PZPWConfig } from "pzpw-config-schema";
import path, { dirname, extname, isAbsolute, join, relative, resolve, sep } from "path";
import { fileURLToPath } from "url";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "fs/promises";
import ts from "typescript";
import { ParsedCommandLine } from "@memoraike/typescript-to-lua";
import { readdirSync } from "fs";
import { ModuleScope, PZPW_ERRORS } from "./constants";
import { logger } from "./logger";

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

/**
 * Find line and column of text by position
 * @param {string} text
 * @param {number} pos
 * @returns {number[]}
 */
export function findPos(text: string, pos: number) {
  const textLines = text.substring(0, pos).split("\n");
  const line = textLines.length;
  const column = textLines[line - 1].length + 1;
  return [line, column];
}

/**
 * Resolve mod directory
 * @param modId
 * @param directory
 */
export function getModRootDir(modId: string, directory: string): string {
  const modRegex = new RegExp(`${modId}$`);
  return directory.match(modRegex) ? directory : join(directory, modId);
}

export function normalizeFileName(
  fileName: string,
  modId: string,
  rootDir: string,
  outDir: string,
): string | undefined {
  const modOutDir = join(outDir, modId);
  const localScopes = getDirectories(rootDir).filter(dir => dir !== modId);
  const modRegex = new RegExp(`^${modId}/`);

  const isLocal = (filePath: string) => {
    const scope = getScope(filePath);
    return scope.type === ModuleScope.global && localScopes.includes(scope.name);
  };

  if (isAbsolute(fileName)) {
    const tryd = relative(modOutDir, fileName);
    fileName = tryd
      .split(sep)
      .filter(p => ![".", ".."].includes(p))
      .join(sep);
  } else {
    // when import from other local mod the program passing rootDir to the directory above level
    fileName = fileName.replace(modRegex, "");
  }
  return isLocal(fileName) ? undefined : fileName;
}

/**
 * Get file scope
 * @param {string} filePath - relative path
 */
export function getScope(filePath: string): {
  type: ModuleScope,
  name: string
} {
  const [targetScope] = filePath.split(sep) as ModuleScope[];
  let scope: ModuleScope;
  switch (targetScope) {
    case ModuleScope.shared:
      scope = ModuleScope.shared;
      break;
    case ModuleScope.client:
      scope = ModuleScope.client;
      break;
    case ModuleScope.server:
      scope = ModuleScope.server;
      break;
    case ModuleScope.lua_module:
      scope = ModuleScope.lua_module;
      break;
    default:
      scope = ModuleScope.global
  }

  return {
    type: scope,
    name: targetScope
  }
}

export function getSourceDir(parsedConfig: ParsedCommandLine) {
  const rootDir = parsedConfig.options.rootDir;
  if (rootDir && rootDir.length > 0) {
    return path.isAbsolute(rootDir) ? rootDir : path.resolve(rootDir);
  }
  return getCommonSourceDirectory(parsedConfig.fileNames);
}

/**
 * Return directories list
 * @param {string} source - absolute path
 */
function getDirectories(source: string): string[] {
  return isAbsolute(source)
    ? readdirSync(source, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)
    : [];
}

export function getCommonSourceDirectory(paths: string[]): string {
  // Split each path into its individual components
  const splitPaths: string[][] = paths.map(path => path.split("/"));
  // Find the shortest path in the list
  const shortestPath: string[] = splitPaths.reduce((acc, curr) => (acc.length < curr.length ? acc : curr));
  // Find the common directory
  let common = "";
  for (let i = 0; i < shortestPath.length; i++) {
    const folder: string = shortestPath[i];
    if (splitPaths.every(path => path[i] === folder)) {
      common = join(common, folder);
    } else {
      break;
    }
  }

  return resolve(common);
}

function isDiagnosticMessageChain(
  messageText: string | ts.DiagnosticMessageChain,
): messageText is ts.DiagnosticMessageChain {
  return typeof messageText === "object" && "messageText" in messageText;
}

/**
 * Log diagnostic message with file and line:column
 * @param diagnostic
 */
export function diagnosticLog(diagnostic: ts.Diagnostic) {
  let file: string;
  // ignore no files to transpile error
  const messageText = isDiagnosticMessageChain(diagnostic.messageText)
    ? diagnostic.messageText.messageText
    : diagnostic.messageText;
  if (Number.isInteger(diagnostic.start)) {
    const [line, column] = findPos(diagnostic.file.text, diagnostic.start);
    file = `${diagnostic.file.fileName}:${line}:${column}`;
  }
  logger.log(
    logger.color.error(PZPW_ERRORS.TRANSPILE_ERROR, diagnostic.code),
    logger.color.error(...[`${messageText}\n`, file && `File: ${file}\n`]),
  );
}