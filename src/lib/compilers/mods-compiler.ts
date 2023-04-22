import { basename, dirname, join, normalize, sep } from "path";
import { PZPWConfig } from "pzpw-config-schema";
import { copyFile, mkdir, readdir, writeFile } from "fs/promises";
import { transpile } from "../transpiler.js";
import { copyDirRecursiveTo, partitionBy } from "../utils.js";
import { logger } from "../logger.js";
import {
  applyReimportScript,
  fixRequire,
  generateModInfo,
  getLicensePath,
  isGlobal,
  isLuaModule,
  isProjectDirScope,
  prepareOutDir,
} from "./utils.js";
import { PMODULES_DIR, PZPW_ASSETS_DIR } from "../constants.js";
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
          logger.color.info(
            `Copying mod image '${basename(file)}' to '${join(
              printedDir,
              modId,
              basename(file)
            )}'...`
          )
        );
        copyFile(join(modSourceDir, file), join(outDir, modId, basename(file)));
      }
    }
  } else {
    logger.log(
      logger.color.warn(modId),
      logger.color.warn(`Missing image assets directory ${modSourceDir}'.`)
    );
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
  const mediaSourceDir = join(
    normalize(PZPW_ASSETS_DIR),
    "mods",
    modId,
    "media"
  );
  if (existsSync(mediaSourceDir)) {
    const mediaDestDir = join(outDir, modId, "media");
    logger.log(
      logger.color.info(modId),
      logger.color.info(
        `Copying 'media' assets to '${join(printedDir, modId, "media")}'...`
      )
    );
    copyDirRecursiveTo(mediaSourceDir, mediaDestDir, [".ts", ".gitkeep"]);
  } else {
    logger.log(
      logger.color.warn(modId),
      logger.color.warn(`Missing 'media' assets directory '${mediaSourceDir}'.`)
    );
  }
}

/**
 * Copy mod source files ignore typescript files
 * @param {string} sourceDir
 * @param {string} outDir
 * @param {string} modId
 * @returns {Promise<void>}
 */
async function copySourceFiles(
  sourceDir: string,
  outDir: string,
  modId: string
) {
  const printedDir = isProjectDirScope(outDir) || outDir;
  const mediaSourceDir = join(sourceDir, modId);
  const mediaDestDir = join(outDir, modId, "media", "lua");
  logger.log(
    logger.color.info(modId),
    logger.color.info(
      `Copying source files to '${join(printedDir, modId, "lua")}'...`
    )
  );
  copyDirRecursiveTo(mediaSourceDir, mediaDestDir, [".ts", ".gitkeep"]);
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
    const mediaDestDir = join(outDir, modId, "LICENSE.txt");
    logger.log(
      logger.color.info(modId),
      logger.color.info(
        `Copying LICENSE.txt to '${join(printedDir, modId)}'...`
      )
    );
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
async function copyCompiledMods(
  outDir: string,
  cacheDir: string,
  modId: string
) {
  const inPath = join(outDir, modId);
  const cacheDirOut = join(cacheDir, "mods", modId);
  logger.log(
    logger.color.info(modId),
    logger.color.info(`Copying '${inPath}' to '${cacheDirOut}'...`)
  );
  copyDirRecursiveTo(inPath, cacheDirOut);
}

function prepareLibPath(libPath: string, outDir: string) {
  return join(PMODULES_DIR, libPath.slice(`${outDir}${sep}`.length));
}

/**
 * Compile mods into dist directory
 * @param pzpwConfig
 * @param modIds
 */
export async function ModsCompiler(
  pzpwConfig: PZPWConfig,
  modIds: string[],
  cachedir: string
) {
  // Transpile typescript
  logger.log(logger.color.info(`- Transpiling ${modIds.length} mod(s)...`));
  const { rootDir, outDir, options, files } = await transpile(modIds);
  logger.log(
    logger.color.info(
      `- Transpiled ${Object.keys(files).length} typescript file(s)!`
    )
  );
  const [libs, mods] = partitionBy(
    Object.keys(files),
    (outputFile) =>
      isGlobal(outDir, outputFile) || isLuaModule(outDir, outputFile)
  );

  await prepareOutDir(modIds, outDir);
  for (const modId of modIds) {
    await generateModInfo(pzpwConfig, modId, outDir);
    await copyImages(outDir, modId);
    await copyMedia(outDir, modId);
    await copySourceFiles(rootDir, outDir, modId);
    await copyLicenseFile(outDir, modId);
  }

  for (const modFileName of mods) {
    const printedDir = modFileName.replace(`${outDir}${sep}`, "");
    const [modId, ...rest] = modFileName
      .replace(`${outDir}${sep}`, "")
      .split(sep);
    const filePath = rest.join(sep);
    const luaOutPath = join(outDir, modId, "media/lua", filePath);
    let luaCode = fixRequire(modId, files[modFileName]);
    luaCode = applyReimportScript(luaCode);
    logger.log(
      logger.color.info(modId),
      logger.color.info(
        `Copying lua source '${printedDir}' to '${modFileName}'.`
      )
    );
    await mkdir(dirname(luaOutPath), { recursive: true });
    await writeFile(luaOutPath, luaCode);
  }

  for (const modId of modIds) {
    for (const lib of libs) {
      const printedDir = lib.replace(`${outDir}${sep}`, "");
      const libOutPath = join(outDir, modId, prepareLibPath(lib, outDir));
      const libCode = files[lib];
      logger.log(
        logger.color.info(modId),
        logger.color.info(
          `Copying lua module '${printedDir}' to '${libOutPath}'.`
        )
      );
      await mkdir(dirname(libOutPath), { recursive: true });
      await writeFile(libOutPath, libCode);
    }
  }


  for (const modId of modIds) {
    await copyCompiledMods(outDir, cachedir, modId);
  }
}
