import { isAbsolute, relative, resolve } from "path";
import ts from "typescript";
import {
  CompilerOptions,
  EmitResult,
  parseConfigFileWithSystem,
  ParsedCommandLine,
  Transpiler,
} from "@memoraike/typescript-to-lua";
import { logger } from "./logger";
import { PZPW_ERRORS } from "./constants";
import { getOutDir } from "./compilers/utils";
import { diagnosticLog, getSourceDir, normalizeFileName } from "./utils";

export type TranspileResult = {
  emitResult: EmitResult;
  options: CompilerOptions;
};

export interface TranspileModResult extends Omit<TranspileResult, "emitResult"> {
  files: { [fileName: string]: string };
  modId: string;
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

function transpile(
  modId: string,
  rootNames: string[],
  options?: CompilerOptions,
  writeFile?: ts.WriteFileCallback,
): TranspileResult {
  const program = ts.createProgram(rootNames, options);
  const preEmitDiagnostics = ts.getPreEmitDiagnostics(program);
  const { diagnostics: transpileDiagnostics, emitSkipped } = new Transpiler().emit({ program, writeFile });
  const diagnostics = ts.sortAndDeduplicateDiagnostics([...preEmitDiagnostics, ...transpileDiagnostics]);

  return {
    emitResult: { diagnostics: [...diagnostics], emitSkipped },
    options: {
      ...program.getCompilerOptions(),
      rootDir: program.getCompilerOptions().rootDir ?? resolve("src"),
    },
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
    const config = parseConfigFileWithSystem("tsconfig.json", compilerOptions || {});

    if (config.errors.length > 0) {
      config.errors.forEach(diagnosticLog);
      logger.throw({
        type: PZPW_ERRORS.COMPILER_ERROR,
        cause: "Project configuration has errors!",
      });
    }

    const rootNames = getModRootNames(modId, config);

    const outDir = getOutDir();
    const rootDir = getSourceDir(config);

    const { emitResult, ...rest } = transpile(modId, rootNames, config.options, (fileName: string, lua: string) => {
      const key = normalizeFileName(fileName, modId, rootDir, outDir);
      if (key) {
        files[key] = lua;
      }
    });

    // Print transpile errors
    emitResult.diagnostics.forEach(diagnosticLog);

    complete({
      modId,
      files,
      ...rest,
    });
  });
}
