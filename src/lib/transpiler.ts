import chalk from "chalk";
import ts from "typescript";
import { CompilerOptions, EmitResult, parseConfigFileWithSystem, ProcessedFile, Transpiler } from "typescript-to-lua";

export type TranspileResult = {[fileName: string]: string}

/**
 * Extend Transpiler
 * - Fix the files output names
 */
class ModTranspiler extends Transpiler {
    protected override getEmitPlan(program: ts.Program, diagnostics: ts.Diagnostic[], files: ProcessedFile[]) {
        const result = super.getEmitPlan(program, diagnostics, files);
        for (const emitPlan of result.emitPlan) {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            emitPlan.outputPath = emitPlan.fileName;

            // Fix path
            emitPlan.outputPath = emitPlan.outputPath.replaceAll("\\", "/");
        }
        return result;
    }
}

/**
 * Custom transpileFiles to run our extended ModTranspiler
 */
function transpileFiles(
    rootNames: string[],
    options: CompilerOptions = {},
    writeFile?: ts.WriteFileCallback
): EmitResult {
    const program = ts.createProgram(rootNames, options);
    const preEmitDiagnostics = ts.getPreEmitDiagnostics(program);
    const { diagnostics: transpileDiagnostics, emitSkipped } = new ModTranspiler().emit({ program, writeFile });
    const diagnostics = ts.sortAndDeduplicateDiagnostics([...preEmitDiagnostics, ...transpileDiagnostics]);

    return { diagnostics: [...diagnostics], emitSkipped };
}

/**
 * Filter file to transpile from the selected mod IDs
 */
function transpileProject(
    modIds: string[],
    configFileName: string,
    optionsToExtend?: CompilerOptions,
    writeFile?: ts.WriteFileCallback
): EmitResult {
    const parseResult = parseConfigFileWithSystem(configFileName, optionsToExtend);
    if (parseResult.errors.length > 0) {
        return { diagnostics: parseResult.errors, emitSkipped: true };
    }

    // Transpile only the files from selected modIds
    parseResult.fileNames = parseResult.fileNames.filter(f => modIds.includes(f.split("/")[1]));

    return transpileFiles(parseResult.fileNames, parseResult.options, writeFile);
}

/**
 * Transpile a project filtered by provided ModIDs
 * @param modIds list of mod ids to transpile
 * @param compilerOptions 
 * @returns 
 */
export async function transpile(modIds: string[], compilerOptions?: CompilerOptions) {
    return new Promise((complete: (result: TranspileResult) => void) => {
        const transpileResult: TranspileResult = {};

        const result = transpileProject(modIds, "tsconfig.json", compilerOptions || {}, (fileName: string, lua: string) => {
            transpileResult[fileName] = lua;
        });

        // Print transpile errors
        result.diagnostics.forEach(diagnostic => {
            if (diagnostic.code !== 18003) // ignore no files to transpile error
                console.error(chalk.red("Transpile Error:"), diagnostic);
        });

        complete(transpileResult);
    });
}
