import { PZPWConfig } from "pzpw-config-schema";
import { writeFile } from "fs/promises";
import { dirname, isAbsolute, join, normalize, resolve, sep } from "path";
import { existsSync } from "fs";
import { LUA_MODULE_DIR, PZPW_ASSETS_DIR, REIMPORT_TEMPLATE } from "../constants.js";
import { logger } from "../logger.js";
import { getTsConfig } from "../utils.js";

/**
 * Check if directory in project scope directory
 * @param {string} dir
 * @returns {string | undefined}
 */
function isProjectDirScope(dir: string): string | undefined {
  return dir.indexOf(resolve()) > -1 ? dir.slice(`${resolve()}${sep}`.length) : undefined;
}

/**
 * Check a transpiled file is lua module
 * @param {string} filePath
 * @returns {boolean}
 */
function isLuaModule(filePath: string): boolean {
  return filePath.indexOf(LUA_MODULE_DIR) === 0;
}

/**
 * Check a transpiled file is globally
 * @param {string} filePath
 * @returns {boolean}
 */
function isGlobal(filePath: string): boolean {
  return dirname(filePath) === ".";
}

/**
 *
 * Get common license path or per mod
 * @param {string} modId
 * @description {projectDir}/assets/LICENSE.txt | {projectDir}/assets/mods/{modId}/LICENSE.txt
 * @returns {string | undefined}
 */
function getLicensePath(modId?: string): string | undefined {
  const commonLicensePath = join(normalize(PZPW_ASSETS_DIR), "LICENSE.txt");
  const modLicensePath = join(normalize(PZPW_ASSETS_DIR), "mods", modId, "LICENSE.txt");
  if (modId && existsSync(modLicensePath)) {
    return modLicensePath;
  }
  return existsSync(commonLicensePath) ? commonLicensePath : undefined;
}

/**
 * Generate mod info
 * @param {PZPWConfig} pzpwConfig
 * @param {string} modId
 * @param {string} outDir
 * @returns {Promise<void>}
 */
async function generateModInfo(pzpwConfig: PZPWConfig, modId: string, outDir: string) {
  const printedDir = isProjectDirScope(outDir) || outDir;
  logger.log(logger.color.info(modId), logger.color.info(`Generating mod.info...`));

  let content = "";

  content += `id=${modId}\r\n`;

  Object.keys(pzpwConfig.mods[modId]).forEach((key: string) => {
    if (pzpwConfig.mods[modId][key] != null) {
      const obj = pzpwConfig.mods[modId][key];
      let value;
      if (Array.isArray(obj)) {
        if (obj.length > 0) value = obj.join(";");
      } else value = obj;

      if (value) content += `${key}=${value}\r\n`;
    }
  });

  if (!pzpwConfig.mods[modId].icon) content += "icon=icon.png\r\n";
  if (!pzpwConfig.mods[modId].poster) content += "poster=poster.png\r\n";

  await writeFile(join(outDir, "mod.info"), content).catch(() =>
    logger.log(logger.color.error(modId), logger.color.error(`Error while writing '${join(printedDir, "mod.info")}'`)),
  );
}

/**
 * Fix the requires
 */
function fixRequire(lua: string) {
  if (lua.length === 0) return "";

  // Zed regex
  const requireRegex = /require\("(.*)"\)/g;
  const sepRegex = /[.]/g;

  lua = lua.replaceAll(requireRegex, match => {
    let str = match.replaceAll(sepRegex, "/"); // Replace dots with slash
    str = str.replaceAll("'", '"'); // Replace single quote to double quotes

    const requireLen = 'require("'.length;
    str = str.replace(str.slice(requireLen, str.indexOf("client/") + "client/".length), ""); // Strip the scope
    str = str.replace(str.slice(requireLen, str.indexOf("server/") + "server/".length), ""); // Strip the scope
    str = str.replace(str.slice(requireLen, str.indexOf("shared/") + "shared/".length), ""); // Strip the scope
    return str;
  });

  return lua;
}

/**
 * Apply reimport script to output file
 */
function applyReimportScript(lua: string): string {
  const assignments: string[] = [];
  const lines = lua.split("\n");

  // Look for any PipeWrench assignments.
  for (const line of lines) {
    if (line.indexOf("local ") === 0 && line.indexOf("____pipewrench.") !== -1) {
      assignments.push(line.replace("local ", ""));
    }
  }
  // Only generate a reimport codeblock if there's anything to import.
  if (!assignments.length) return lua;

  // Take out the returns' statement, so we can insert before it.
  lines.pop();
  const returnLine: string = lines.pop();
  lines.push("");

  // Build the reimport event.
  let compiledImports = "";
  for (const assignment of assignments) compiledImports += `${assignment}\n`;
  const reimports = REIMPORT_TEMPLATE.replace("-- {IMPORTS}", compiledImports.substring(0, compiledImports.length - 1));

  return `${lines.join("\n")}\n${reimports}\n\n${returnLine}\n`;
}

/**
 * Get default outDir or from tsconfig
 */
function getOutDir(): string {
  const tsConfig = getTsConfig();
  const outDir = tsConfig.options.outDir;
  if (outDir && outDir.length > 0) {
    return isAbsolute(outDir) ? outDir : resolve(outDir);
  }
  return resolve("dist");
}

/**
 * Get module name
 * @param {string} module
 */
function getModuleName(module: string): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_, s, n] = module.split(sep);
  return s.charAt(0) === "@" ? `${s}/${n}` : `${s}`;
}

/**
 * Group files by module name
 * @param {Record<string, string>} modules
 */
function mergeFilesByModule(modules: Record<string, string>): Record<string, { [p: string]: string }[]> {
  const unite: Record<string, { [file: string]: string }[]> = {};
  Object.entries(modules).forEach(([fileName, luaCode]) => {
    if (isLuaModule(fileName)) {
      unite[getModuleName(fileName)] = [
        ...(unite[getModuleName(fileName)] || []),
        {
          [fileName]: fixRequire(luaCode),
        },
      ];
    } else {
      unite[fileName] = [{ [fileName]: luaCode }];
    }
  })
  return unite;
}

export {
  getOutDir,
  mergeFilesByModule,
  fixRequire,
  isProjectDirScope,
  applyReimportScript,
  generateModInfo,
  getLicensePath,
  isGlobal,
  isLuaModule,
};
