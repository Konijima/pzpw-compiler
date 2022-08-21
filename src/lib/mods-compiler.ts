import { transpile } from "./transpiler.js";

export async function ModsCompiler(pzpwConfig: any, modIds: string[]) {
    const transpileResult = await transpile(modIds);


}
