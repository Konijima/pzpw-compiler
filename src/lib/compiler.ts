import chalk from 'chalk';
import { execSync } from 'child_process';
import { Settings } from "./settings.js";
import { getHelp, getIntro, getPZPWConfig } from "./utils.js";

export class Compiler {
    
    private settings: Settings;
    private pzpwConfig?: any;
    readonly args: {[key: string]: (string | number)[]};

    constructor(args: {[key: string]: (string | number)[]}) {
        this.args = args;
    }

    public async run() {
        await getIntro().then(text => console.log(chalk.greenBright(text)));

        this.settings = await Settings.Load();
        this.pzpwConfig = await getPZPWConfig().catch(() => {});

        await this.exec();
    }

    private requirePZPWProject() {
        if (!this.pzpwConfig)
            throw chalk.red('This command must be executed from the root of your PZPW project.');
    }

    private async exec() {
        if (this.args.mods)
            await this.compileMods();

        else if (this.args.workshop)
            await this.compileWorkshop();

        else if (this.args.cachedir)
            await this.cachedirCommand();

        else if (this.args.update)
            await this.updateCommand();
        
        else await getHelp().then(text => console.log(chalk.grey(text)));
    }

    private async compileMods() {
        await this.requirePZPWProject();

        console.log(chalk.bgCyan('Compiling Mods'));
    }

    private async compileWorkshop() {
        await this.requirePZPWProject();

        console.log(chalk.bgCyan('Compiling Workshop'));
    }

    private async cachedirCommand() {
        console.log(chalk.bgCyan('Cachedir'));
    }

    private async updateCommand() {
        console.log(chalk.bgCyan('Updating...'));
        
        return new Promise((resolve: Function) => {
            const buffer = execSync('npm update');
            console.log(chalk.gray(buffer.toString()));
            resolve();
        });
    }
}
