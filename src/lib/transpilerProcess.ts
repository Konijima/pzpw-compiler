import { transpileMod } from "./transpiler.js";

(async function() {
    const modId = process.argv[2];
    const compilerOptions = (process.argv[3] !== 'undefined') ? JSON.parse(process.argv[3]) : undefined;

    const result = await transpileMod(modId, compilerOptions)
    if (process.send) process.send(result);
})();
