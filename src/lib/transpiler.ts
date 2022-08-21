import ts from "typescript";
import { resolve } from "path";
import { CompilerOptions, EmitResult, parseConfigFileWithSystem, transpileFiles } from "typescript-to-lua";

export type TranspileResult = {[fileName: string]: string}

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
    parseResult.fileNames = parseResult.fileNames.filter(f => modIds.includes(f.split('/')[1]));

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

        const result = transpileProject(modIds, 'tsconfig.json', compilerOptions || {}, (fileName: string, lua: string, _, onError: Function) => {
            // Remove project direction, change all \\, remove file extention, remove first /
            const cleanFileName = fileName.replace(resolve("./"), "").replaceAll('\\', '/').replace('.lua', '').slice(1);

            transpileResult[cleanFileName] = lua;
        });

        // Print transpile errors
        result.diagnostics.forEach(diagnostic => {
            console.error('Transpile Error:', diagnostic);
        });

        complete(transpileResult);
    });
}
