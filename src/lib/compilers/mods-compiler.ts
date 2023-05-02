import { basename, dirname, join, normalize } from "path";
import { PZPWConfig } from "pzpw-config-schema";
import { copyFile, mkdir, readdir, rm, writeFile } from "fs/promises";
import { transpileMod } from "../transpiler.js";
import { copyDirRecursiveTo, partitionBy } from "../utils.js";
import { logger } from "../logger.js";
import {
  applyReimportScript,
  fixRequire,
  generateModInfo,
  getLicensePath,
  getOutDir,
  isGlobal,
  isLuaModule,
  isProjectDirScope,
  mergeFilesByModule,
} from "./utils.js";
import { LUA_SHARED_MODULES_DIR, PZPW_ASSETS_DIR, PZPW_ERRORS } from "../constants.js";
import { existsSync } from "fs";

/**
 * Copy mod images to dest dir
 * @param {string} outDir
 * @param {string} modId
 * @returns {Promise<void>}
 */
async function copyImages(outDir: string, modId: string) {
  const printedDir = isProjectDirScope(outDir) || outDir;
  const modSourceDir = join(normalize(PZPW_ASSETS_DIR), "mods", modId);
  if (existsSync(modSourceDir)) {
    const files = await readdir(modSourceDir);
    for (const file of files) {
      if (file.toLowerCase().endsWith(".png")) {
        logger.log(
          logger.color.info(modId),
          logger.color.info(`Copying mod image '${basename(file)}' to '${printedDir}'...`),
        );
        copyFile(join(modSourceDir, file), join(outDir, basename(file)));
      }
    }
  } else {
    logger.log(logger.color.warn(modId), logger.color.warn(`Missing image assets directory '${modSourceDir}'.`));
  }
}

/**
 * Copy mod assets to dest dir
 * @param {string} outDir
 * @param {string} modId
 * @returns {Promise<void>}
 */
async function copyMedia(outDir: string, modId: string) {
  const printedDir = isProjectDirScope(outDir) || outDir;
  const mediaSourceDir = join(normalize(PZPW_ASSETS_DIR), "mods", modId, "media");
  if (existsSync(mediaSourceDir)) {
    const mediaDestDir = join(outDir, "media");
    logger.log(
      logger.color.info(modId),
      logger.color.info(`Copying 'media' assets to '${join(printedDir, "media")}'...`),
    );
    copyDirRecursiveTo(mediaSourceDir, mediaDestDir, [".ts", ".gitkeep"]);
  } else {
    logger.log(logger.color.warn(modId), logger.color.warn(`Missing 'media' assets directory '${mediaSourceDir}'.`));
  }
}

/**
 * Copy mod source files ignore typescript files
 * @param {string} sourceDir
 * @param {string} outDir
 * @param {string} modId
 * @returns {Promise<void>}
 */
async function copySourceFiles(sourceDir: string, outDir: string, modId: string) {
  const mediaDestDir = join(outDir, "media", "lua");
  const printedDir = isProjectDirScope(mediaDestDir) || mediaDestDir;
  logger.log(logger.color.info(modId), logger.color.info(`Copying source files to '${printedDir}'...`));
  copyDirRecursiveTo(sourceDir, mediaDestDir, [".ts", ".gitkeep"]);
}

/**
 * Copy license file to mod dest directory
 * @param {string} outDir
 * @param {string} modId
 * @returns {Promise<void>}
 */
async function copyLicenseFile(outDir: string, modId: string) {
  const printedDir = isProjectDirScope(outDir) || outDir;
  const licensePath = getLicensePath(modId);
  if (licensePath) {
    const mediaDestDir = join(outDir, "LICENSE.txt");
    logger.log(logger.color.info(modId), logger.color.info(`Copying LICENSE.txt to '${join(printedDir)}'...`));
    await copyFile(licensePath, mediaDestDir);
  }
}

/**
 * Copy compiled mod directory to cachedir
 * @param {string} outDir
 * @param {string} cacheDir
 * @param {string} modId
 * @returns {Promise<void>}
 */
async function copyCompiledMods(outDir: string, cacheDir: string, modId: string) {
  const inPath = join(outDir, modId);
  const cacheDirOut = join(cacheDir, "mods", modId);
  logger.log(logger.color.info(modId), logger.color.info(`Copying '${inPath}' to '${cacheDirOut}'...`));
  copyDirRecursiveTo(inPath, cacheDirOut);
}

/**
 * Compile mods into dist directory
 * @param pzpwConfig
 * @param modIds
 */
export async function ModsCompiler(pzpwConfig: PZPWConfig, modIds: string[], cachedir: string) {
  const compiledModIds: string[] = [];

  // Transpile typescript
  logger.log(logger.color.info(`- Transpiling ${modIds.length} mod(s)...`));
  const outDir = getOutDir();
  const printedDir = isProjectDirScope(outDir) || outDir;

  logger.log(logger.color.info(`- Deleting directory '${printedDir}'...`));
  await rm(outDir, { force: true, recursive: true });

  for (const modId of modIds) {
    logger.log("");
    logger.log(logger.color.info(modId), logger.color.info(`Transpiling...`));
    const { files, rootDir } = await transpileMod(modId);

    if (!existsSync(rootDir)) {
      logger.log("");
      logger.log(
        logger.color.error(PZPW_ERRORS.COMPILER_ERROR),
        logger.color.error(`Source directory doesn't exist: ${rootDir}`),
      );
      continue;
    }

    logger.log(
      logger.color.info(modId),
      logger.color.info(`Transpiled ${Object.keys(files).length} typescript file(s)!`),
    );

    logger.log(logger.color.info(modId), logger.color.info(`Creating directory '${join(printedDir, modId)}'...`));
    const modOutDir = join(outDir, modId);
    await mkdir(modOutDir, { recursive: true });

    await generateModInfo(pzpwConfig, modId, modOutDir);
    await copyImages(modOutDir, modId);
    await copyMedia(modOutDir, modId);
    await copySourceFiles(rootDir, modOutDir, modId);
    await copyLicenseFile(modOutDir, modId);

    const [luaModules, luaSources] = partitionBy(
      Object.entries(files),
      ([outputFile]) => isGlobal(outputFile) || isLuaModule(outputFile),
    );

    for (const [fileName, luaCode] of luaSources) {
      const printedDir = isProjectDirScope(modOutDir) || modOutDir;
      const luaOutPath = join(modOutDir, "media/lua", fileName);
      let code = fixRequire(modId, luaCode);
      code = applyReimportScript(code);
      logger.log(logger.color.info(modId), logger.color.info(`Copying lua source '${fileName}' to '${printedDir}'.`));
      await mkdir(dirname(luaOutPath), { recursive: true });
      await writeFile(luaOutPath, code);
    }

    logger.log(logger.color.info(`\n- Copying lua modules...`));
    const modules = mergeFilesByModule(Object.fromEntries(luaModules));
    const modulesDir = join(modOutDir, normalize(LUA_SHARED_MODULES_DIR));
    await mkdir(modulesDir, { recursive: true });
    for (const moduleName in modules) {
      logger.log(logger.color.info(moduleName), logger.color.info(`Copying lua module to '${modulesDir}'.`));

      for (const module of modules[moduleName]) {
        const key = Object.keys(module)[0];
        await mkdir(dirname(join(modulesDir, key)), { recursive: true });
        await writeFile(join(modulesDir, key), module[key]);
      }
    }

    compiledModIds.push(modId);
  }

  logger.log(logger.color.info(`\n- Compile ${compiledModIds.length} mod(s) [ ${compiledModIds.join(", ")} ].`));
  logger.log(logger.color.info(`- Copying compiled mods...`));
  for (const mod of compiledModIds) {
    await copyCompiledMods(outDir, cachedir, mod);
  }
}
