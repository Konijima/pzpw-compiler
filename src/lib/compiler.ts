import chalk from 'chalk';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { Settings } from "./settings.js";
import { ModsCompiler } from './mods-compiler.js';
import { WorkshopCompiler } from './workshop-compiler.js';
import { getCommandHelp, getHelp, getIntro, getPZPWConfig } from "./utils.js";

export class Compiler {
    
    private settings: Settings;
    private pzpwConfig?: any;
    readonly args: {[key: string]: (string | number)[]};

    constructor(args: {[key: string]: (string | number)[]}) {
        this.args = args;
    }

    /**
     * Start the compiler process
     */
    public async run() {
        this.settings = await Settings.Load();
        this.pzpwConfig = await getPZPWConfig().catch(() => {});

        await this.exec();
    }

    /**
     * Verify that the process is running inside a PZPW project.
     */
    private requirePZPWProject() {
        if (!this.pzpwConfig)
            throw chalk.red('This command must be executed from the root of your PZPW project.');
    }

    /**
     *  
     * @returns 
     */
    private getCommand() {
        const commandName = this.args[''].slice(0, 1)[0];
        const commandParams = this.args[''].slice(1);
        return {
            name: commandName,
            params: commandParams,
        };
    }

    /**
     * Execute commands
     */
    private async exec() {
        let command = this.getCommand();

        const shortIntro = (!command.name || command.name === 'help');
        await getIntro().then(text => console.log(chalk.greenBright((!shortIntro) ? text.split('\n').slice(0, 4).join('\n') : text)));

        // Debug Flag
        if (this.args.debug) {
            console.log(chalk.magenta("Command:"), command);
            console.log(chalk.magenta("Settings:"), this.settings.settings, '\n');
        }

        if (command.name === "help" && command.params.length > 0)
            await getCommandHelp(command.params[0] as string, true).then(text => console.log(chalk.grey(text)))
                .catch(_ => console.log(chalk.grey(`Command "${command.params[0] as string}" not found!`)));

        else if (command.name === "mods")
            await this.compileMods(command.params);

        else if (command.name === "workshop")
            await this.compileWorkshop(command.params);

        else if (command.name === "cachedir" )
            await this.cachedirCommand(command.params);

        else if (command.name === "update")
            await this.updateCommand(command.params);
        
        else await getHelp().then(text => console.log(chalk.grey(text)));
    }

    /**
     * Compile mods command
     */
    private async compileMods(params: (string | number)[]) {
        await this.requirePZPWProject();

        // Validate mods to compile
        let validModIds: string[] = [];
        let modIds = (params.length > 0) ? params : Object.keys(this.pzpwConfig.mods);
        for (const modId of modIds as string[]) {
            if (this.pzpwConfig.mods[modId]) validModIds.push(modId);
            else console.log(chalk.red(`Mod ${modId} is not found in this project!`));
        }

        if (validModIds.length === 0)
            throw chalk.red('No mod found to compile!\nCheck that mod IDs are set correctly in your project\'s pzpw-config.json');

        console.log(chalk.cyan(`Compiling ${validModIds.length} mod(s) [ ${validModIds.join(", ")} ]...`));

        await ModsCompiler(this.pzpwConfig, validModIds);

        return validModIds;
    }

    /**
     * Compile workshop command
     */
    private async compileWorkshop(params: (string | number)[]) {
        await this.requirePZPWProject();

        let modIds = (params.length > 0) ? params : Object.keys(this.pzpwConfig.workshop.mods);
        const validModIds = await this.compileMods(modIds).catch(error => { throw error; });

        console.log(chalk.cyan('Compiling Workshop mods ...'));

        await WorkshopCompiler(this.pzpwConfig, validModIds);
    }

    /**
     * Get or set game cachedir path command
     */
    private async cachedirCommand(params: (string | number)[]) {
        if (!params[0] || params[0] === "get") {
            console.log('cachedir: ', chalk.cyanBright(this.settings.get('cachedir')));
        }

        else if (params[0] === "set") {
            const cachedir = params[1].toString();
            if (existsSync(cachedir)) {
                this.settings.set('cachedir', cachedir);
                this.settings.save();
                console.log(chalk.green(`cachedir is now "${cachedir}`));
            }
            else console.log(chalk.red(`Path "${cachedir}" doesn't exist!`));
        }

        else if (params[0] === "unset") {
            const cachedir = join(homedir(), 'Zomboid');
            this.settings.set('cachedir', cachedir);
            this.settings.save();
            console.log(chalk.green(`cachedir is now "${cachedir}`));
        }

        else {
            console.log(chalk.red(`First param must be 'get | set | unset' but got '${params[0]}'!`));
        }
    }

    /**
     * Update pzpw-compiler command
     */
    private async updateCommand(params: (string | number)[]) {
        console.log(chalk.cyan('Updating PZPW Compiler...'));
        
        return new Promise((resolve: Function) => {
            const module = (params[0]) ? params[0] : 'pzpw-compiler';
            const buffer = execSync(`npm install -g ${module}`);
            console.log(chalk.gray(buffer.toString().trim()));
            resolve();
        });
    }
}
