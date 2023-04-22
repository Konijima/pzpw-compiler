import { resolve } from "path";
import ts from "typescript";
import {
  CompilerOptions,
  EmitResult,
  getEmitOutDir,
  getSourceDir,
  parseConfigFileWithSystem,
  ProcessedFile,
  Transpiler,
} from "typescript-to-lua";
import { logger } from "./logger.js";
import { PZPW_ERRORS } from "./constants.js";

export type TranspileResult = {
  files: { [fileName: string]: string };
  options: CompilerOptions;
  rootDir: string;
  outDir: string;
};

function isDiagnosticMessageChain(
  messageText: string | ts.DiagnosticMessageChain
): messageText is ts.DiagnosticMessageChain {
  return typeof messageText === "object" && "messageText" in messageText;
}

interface TranspileFilesResult extends Omit<TranspileResult, "files"> {
  emitResult: EmitResult;
}

/**
 * Custom transpileFiles to run our extended ModTranspiler
 */
function transpileFiles(
  rootNames: string[],
  options: CompilerOptions = {},
  writeFile?: ts.WriteFileCallback
): TranspileFilesResult {
  const program = ts.createProgram(rootNames, options);

  if (!program.getCompilerOptions().outDir) {
    logger.throw({
      type: PZPW_ERRORS.CONFIG_ERROR,
      cause: "Must specify outDir in tsconfig.json",
    });
  }

  const preEmitDiagnostics = ts.getPreEmitDiagnostics(program);
  const { diagnostics: transpileDiagnostics, emitSkipped } =
    new Transpiler().emit({ program, writeFile });
  const diagnostics = ts.sortAndDeduplicateDiagnostics([
    ...preEmitDiagnostics,
    ...transpileDiagnostics,
  ]);

  return {
    emitResult: { diagnostics: [...diagnostics], emitSkipped },
    options: program.getCompilerOptions(),
    rootDir: getSourceDir(program),
    outDir: getEmitOutDir(program),
  };
}

type TranspileProjectResult = TranspileFilesResult;

/**
 * Filter file to transpile from the selected mod IDs
 */
function transpileProject(
  modIds: string[],
  configFileName: string,
  optionsToExtend?: CompilerOptions,
  writeFile?: ts.WriteFileCallback
): TranspileProjectResult {
  const parseResult = parseConfigFileWithSystem(
    configFileName,
    optionsToExtend
  );
  if (parseResult.errors.length > 0) {
    return {
      emitResult: { diagnostics: parseResult.errors, emitSkipped: true },
      options: parseResult.options,
      rootDir: parseResult.options.rootDir,
      outDir: parseResult.options.outDir,
    };
  }

  // Transpile only the files from selected modIds
  parseResult.fileNames = parseResult.fileNames
    .filter((f) => modIds.includes(f.split("/")[1]))
    .map((file) => resolve(process.cwd(), file));

  return transpileFiles(parseResult.fileNames, parseResult.options, writeFile);
}

/**
 * Transpile a project filtered by provided ModIDs
 * @param modIds list of mod ids to transpile
 * @param compilerOptions
 * @returns
 */
export async function transpile(
  modIds: string[],
  compilerOptions?: CompilerOptions
) {
  return new Promise((complete: (result: TranspileResult) => void) => {
    const files: TranspileResult["files"] = {};

    const { emitResult, ...rest } = transpileProject(
      modIds,
      "tsconfig.json",
      compilerOptions || {},
      (fileName: string, lua: string) => {
        files[fileName] = lua;
      }
    );

    // Print transpile errors
    emitResult.diagnostics.forEach((diagnostic) => {
      if (diagnostic.code !== 18003) {
        // ignore no files to transpile error
        const messageText = isDiagnosticMessageChain(diagnostic.messageText)
          ? diagnostic.messageText.messageText
          : diagnostic.messageText;
        logger.throw({
          type: PZPW_ERRORS.TRANSPILE_ERROR,
          cause: [`\n${messageText}`, `\nFile: ${diagnostic.file?.fileName}`],
        });
      }
    });

    complete({
      files,
      ...rest,
    });
  });
}
