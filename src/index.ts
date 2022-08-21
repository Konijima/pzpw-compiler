#!/usr/bin/env node

import { Compiler } from "./lib/compiler.js";

(async () => {

    const startTime = Date.now();

    try {

        // Parse process args
        let arg = '';
        const args: {[key: string]: (string | number)[]} = {
            '': []
        };
        for (const value of process.argv.slice(2)) {
            if (value.startsWith('-')) {
                if (parseFloat(value)) {
                    args[arg].push(parseFloat(value));
                    arg = '';
                }
                else {
                    arg = value.slice(1); 
                    if (arg.length> 0) 
                        args[arg] = [];
                }
            }
            else {
                args[arg].push(value);
                arg = '';
            }
        }

        // Init Compiler
        await new Compiler(args).run();
    }
    catch(error) {
        console.error(error);
    }
    finally {
        const totalSeconds = (Date.now() - startTime) / 1000;
        console.log(`\nPZPW Compiler terminated! (${totalSeconds}s)`)
    }

})();
