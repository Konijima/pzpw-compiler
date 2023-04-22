import { PZPWConfig } from "pzpw-config-schema";
import { mkdir, rm, writeFile } from "fs/promises";
import { join, normalize, parse, resolve, sep } from "path";
import { existsSync } from "fs";
import { PZPW_ASSETS_DIR, REIMPORT_TEMPLATE } from "../constants.js";
import { logger } from "../logger.js";

/**
 * Check if directory in project scope directory
 * @param {string} dir
 * @returns {string | undefined}
 */
function isProjectDirScope(dir: string): string | undefined {
  return dir.indexOf(resolve()) > -1
    ? dir.slice(`${resolve()}${sep}`.length)
    : undefined;
}

/**
 * Check a transpiled file is lua module
 * @param {string} rootDir
 * @param {string} filePath
 * @returns {boolean}
 */
function isLuaModule(rootDir: string, filePath: string): boolean {
  return (
    parse(filePath)
      .dir.slice(`${rootDir}${sep}`.length)
      .indexOf("lua_modules") === 0
  );
}

/**
 * Check a transpiled file is globally
 * @param {string} rootDir
 * @param {string} filePath
 * @returns {boolean}
 */
function isGlobal(rootDir: string, filePath: string): boolean {
  return parse(filePath).dir === rootDir;
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
  const modLicensePath = join(
    normalize(PZPW_ASSETS_DIR),
    "mods",
    modId,
    "LICENSE.txt"
  );
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
async function generateModInfo(
  pzpwConfig: PZPWConfig,
  modId: string,
  outDir: string
) {
  const printedDir = isProjectDirScope(outDir) || outDir;
  logger.log(
    logger.color.info(modId),
    logger.color.info(`Generating '${join(printedDir, modId, "mod.info")}'...`)
  );

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

  await writeFile(join(outDir, modId, "mod.info"), content).catch(() =>
    logger.log(
      logger.color.error(modId),
      logger.color.error(
        `Error while writing '${join(printedDir, modId, "mod.info")}'`
      )
    )
  );
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
    str = str.replaceAll("'", '"'); // Replace single quote to double quotes

    const requireLen = 'require("'.length;
    str = str.replace(
      str.slice(requireLen, str.indexOf("client/") + "client/".length),
      ""
    ); // Strip the scope
    str = str.replace(
      str.slice(requireLen, str.indexOf("server/") + "server/".length),
      ""
    ); // Strip the scope
    str = str.replace(
      str.slice(requireLen, str.indexOf("shared/") + "shared/".length),
      ""
    ); // Strip the scope

    str =
      str == 'require("lualib_bundle")'
        ? `require("${modId}/lualib_bundle")`
        : str;
    str =
      str == 'require("@asledgehammer/pipewrench")'
        ? `require("${modId}/PipeWrench")`
        : str;
    str =
      str == 'require("@asledgehammer/pipewrench-events")'
        ? `require("${modId}/PipeWrench-Events")`
        : str;
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
    if (
      line.indexOf("local ") === 0 &&
      line.indexOf("____pipewrench.") !== -1
    ) {
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
  const reimports = REIMPORT_TEMPLATE.replace(
    "-- {IMPORTS}",
    compiledImports.substring(0, compiledImports.length - 1)
  );

  return `${lines.join("\n")}\n${reimports}\n\n${returnLine}\n`;
}

/**
 * Preparing out directory, remove old and create new mod directories
 * @param {string[]} modIds
 * @param {string} outDir
 * @returns {Promise<void>}
 */
async function prepareOutDir(modIds: string[], outDir: string) {
  const printedDir = isProjectDirScope(outDir) || outDir;

  logger.log(logger.color.info(`- Deleting directory '${printedDir}'...`));
  await rm(outDir, { force: true, recursive: true });
  for (const modId of modIds) {
    logger.log(
      logger.color.info(modId),
      logger.color.info(`Creating directory '${join(printedDir, modId)}'...`)
    );
    await mkdir(join(outDir, modId), { recursive: true });
  }
}

export {
  fixRequire,
  isProjectDirScope,
  prepareOutDir,
  applyReimportScript,
  generateModInfo,
  getLicensePath,
  isGlobal,
  isLuaModule,
};
