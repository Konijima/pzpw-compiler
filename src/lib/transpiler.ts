import { isAbsolute, relative, resolve } from "path";
import ts from "typescript";
import {
  CompilerOptions,
  EmitFile,
  EmitResult,
  getEmitPath,
  getSourceDir,
  isBundleEnabled,
  parseConfigFileWithSystem,
  ParsedCommandLine,
  ProcessedFile,
  Transpiler,
} from "typescript-to-lua";
import { logger } from "./logger";
import { PZPW_ERRORS } from "./constants";
import { getOutDir } from "./compilers/utils";
import { findPos } from "./utils";
import { normalizeSlashes } from "typescript-to-lua/dist/utils";
import { getBundleResult } from "typescript-to-lua/dist/transpilation/bundle";
import * as performance from "typescript-to-lua/dist/measure-performance";
import { resolveDependencies } from "./resolve";

export type TranspileResult = {
  emitResult: EmitResult;
  options: CompilerOptions;
  rootDir: string;
};

export interface TranspileModResult extends Omit<TranspileResult, "emitResult"> {
  files: { [fileName: string]: string };
  modId: string;
}

function isDiagnosticMessageChain(
  messageText: string | ts.DiagnosticMessageChain,
): messageText is ts.DiagnosticMessageChain {
  return typeof messageText === "object" && "messageText" in messageText;
}

/**
 * Get only target mod files
 * @param {string} modId
 * @param {ParsedCommandLine} config
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

class PZPWTranspiler extends Transpiler {
  constructor() {
    super();
  }

  protected getEmitPlan(
    program: ts.Program,
    diagnostics: ts.Diagnostic[],
    files: ProcessedFile[],
  ): {
    emitPlan: EmitFile[];
  } {
    performance.startSection("getEmitPlan");
    const options = program.getCompilerOptions() as CompilerOptions;

    if (options.tstlVerbose) {
      console.log("Constructing emit plan");
    }

    // Resolve imported modules and modify output Lua requires
    const resolutionResult = resolveDependencies(program, files, this.emitHost);
    diagnostics.push(...resolutionResult.diagnostics);

    const lualibRequired = resolutionResult.resolvedFiles.some(f => f.fileName === "lualib_bundle");
    if (lualibRequired) {
      // Remove lualib placeholders from resolution result
      resolutionResult.resolvedFiles = resolutionResult.resolvedFiles.filter(f => f.fileName !== "lualib_bundle");

      if (options.tstlVerbose) {
        console.log("Including lualib bundle");
      }
      // Add lualib bundle to source dir 'virtually', will be moved to correct output dir in emitPlan
      const fileName = normalizeSlashes(resolve(getSourceDir(program), "lualib_bundle.lua"));
      const code = this["getLuaLibBundleContent"](options, resolutionResult.resolvedFiles);
      resolutionResult.resolvedFiles.unshift({ fileName, code });
    }

    let emitPlan: EmitFile[];
    if (isBundleEnabled(options)) {
      const [bundleDiagnostics, bundleFile] = getBundleResult(program, resolutionResult.resolvedFiles);
      diagnostics.push(...bundleDiagnostics);
      emitPlan = [bundleFile];
    } else {
      emitPlan = resolutionResult.resolvedFiles.map(file => ({
        ...file,
        outputPath: getEmitPath(file.fileName, program),
      }));
    }

    performance.endSection("getEmitPlan");

    return { emitPlan };
  }
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
  const { diagnostics: transpileDiagnostics, emitSkipped } = new PZPWTranspiler().emit({ program, writeFile });
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
    const files: Record<string, string> = {};
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
    });

    complete({
      modId,
      files,
      ...rest,
    });
  });
}
