import { isAbsolute, relative, resolve } from "path";
import ts, { ParsedCommandLine } from "typescript";
import { CompilerOptions, EmitResult, parseConfigFileWithSystem, Transpiler } from "typescript-to-lua";
import { logger } from "./logger.js";
import { PZPW_ERRORS } from "./constants.js";
import { getOutDir } from "./compilers/utils.js";

export type TranspileResult = {
  emitResult: EmitResult;
  options: CompilerOptions;
  rootDir: string;
};

export interface TranspileModResult extends Omit<TranspileResult, "emitResult"> {
  files: { [fileName: string]: string };
}

function isDiagnosticMessageChain(
  messageText: string | ts.DiagnosticMessageChain,
): messageText is ts.DiagnosticMessageChain {
  return typeof messageText === "object" && "messageText" in messageText;
}

/**
 * Get only target mod files
 * @param {string} modId
 * @param {ts.ParsedCommandLine} config
 * @returns {string[]}
 */
function getModRootNames(modId: string, config: ParsedCommandLine): string[] {
  const sourceDir = resolve(config.options.rootDir || "src");
  return config.fileNames
    .filter(filePath => relative(sourceDir, filePath).indexOf(modId) === 0)
    .map(filePath => (isAbsolute(filePath) ? filePath : resolve(filePath)));
}

function getModRootDir(modId: string, options: CompilerOptions) {
  return options.rootDir ? resolve(options.rootDir, modId) : resolve("src", modId);
}

function transpile(
  modId: string,
  configFileName: string,
  optionsToExtend?: CompilerOptions,
  writeFile?: ts.WriteFileCallback,
): TranspileResult {
  const config = parseConfigFileWithSystem(configFileName, optionsToExtend);

  if (config.errors.length > 0) {
    return {
      emitResult: { diagnostics: config.errors, emitSkipped: true },
      options: config.options,
      rootDir: config.options.rootDir,
    };
  }

  const rootNames = getModRootNames(modId, config);
  config.options.rootDir = getModRootDir(modId, config.options);
  const program = ts.createProgram(rootNames, config.options);
  const preEmitDiagnostics = ts.getPreEmitDiagnostics(program);
  const { diagnostics: transpileDiagnostics, emitSkipped } = new Transpiler().emit({ program, writeFile });
  const diagnostics = ts.sortAndDeduplicateDiagnostics([...preEmitDiagnostics, ...transpileDiagnostics]);

  return {
    emitResult: { diagnostics: [...diagnostics], emitSkipped },
    options: program.getCompilerOptions(),
    rootDir: config.options.rootDir,
  };
}

/**
 * Transpile mod and return file names with lua code content
 * @param {string} modId
 * @param {CompilerOptions} compilerOptions
 * @returns {Promise<TranspileResult>}
 */
export async function transpileMod(modId: string, compilerOptions?: CompilerOptions) {
  return new Promise((complete: (result: TranspileModResult) => void) => {
    const files: TranspileModResult["files"] = {};
    const outDir = getOutDir();

    const { emitResult, ...rest } = transpile(
      modId,
      "tsconfig.json",
      compilerOptions || {},
      (fileName: string, lua: string) => {
        const key = isAbsolute(fileName) ? relative(outDir, fileName) : fileName;
        files[key] = lua;
      },
    );

    // Print transpile errors
    emitResult.diagnostics.forEach(diagnostic => {
      if (diagnostic.code !== 18003) {
        // ignore no files to transpile error
        const messageText = isDiagnosticMessageChain(diagnostic.messageText)
          ? diagnostic.messageText.messageText
          : diagnostic.messageText;
        logger.log(
          logger.color.error(PZPW_ERRORS.TRANSPILE_ERROR, diagnostic.code),
          logger.color.error(...[`${messageText}`, `\nFile: ${diagnostic.file?.fileName}\n`]),
        );
      }
    });

    complete({
      files,
      ...rest,
    });
  });
}
