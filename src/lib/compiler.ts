import chalk from "chalk";
import { join } from "path";
import { homedir } from "os";
import { existsSync } from "fs";
import { rm } from "fs/promises";
import { execSync } from "child_process";
import { PZPWConfig } from "pzpw-config-schema";
import { Settings } from "./settings.js";
import { ModsCompiler } from "./compilers/mods-compiler.js";
import { WorkshopCompiler } from "./compilers/workshop-compiler.js";
import { getCommandHelp, getHelp, getIntro, getPZPWConfig } from "./utils.js";

export class Compiler {
    
    private settings: Settings;
    private pzpwConfig: PZPWConfig | undefined;
    readonly args: {[key: string]: (string | number)[]};

    constructor(args: {[key: string]: (string | number)[]}) {
        this.args = args;
    }

    /**
     * Start the compiler process
     */
    public async run() {
        this.settings = await Settings.Load();
        await getPZPWConfig().then(pzpwConfig => this.pzpwConfig = pzpwConfig).catch(() => { /** ignore */ });

        await this.exec();
    }

    /**
     * Verify that the process is running inside a PZPW project.
     */
    private requirePZPWProject() {
        if (!this.pzpwConfig)
            throw chalk.red("This command must be executed from the root of your PZPW project.");
    }

    /**
     * Get the command and parameters
     */
    private getCommand() {
        const commandName = this.args[""].slice(0, 1)[0];
        const commandParams = this.args[""].slice(1);
        return {
            name: commandName,
            params: commandParams,
        };
    }

    /**
     * Print full intro
     */
    private async printIntro() {
        await getIntro().then(text => console.log(chalk.greenBright(text)));
    }

    /**
     * Execute commands
     */
    private async exec() {
        const command = this.getCommand();

        if (!command.name || command.name === "help")
            await this.printIntro();

        // Debug Flag
        if (this.args.debug) {
            console.log(chalk.magenta("Command:"), command);
            console.log(chalk.magenta("Settings:"), this.settings.settings, "\n");
        }

        if (command.name === "help" && command.params.length > 0)
            await getCommandHelp(command.params[0] as string, true).then(text => console.log(chalk.grey(text)))
                .catch(() => console.log(chalk.grey(`Command "${command.params[0] as string}" not found!`)));

        else if (command.name === "mods")
            await this.compileMods(command.params);

        else if (command.name === "workshop")
            await this.compileWorkshop(command.params);

        else if (command.name === "cachedir" )
            await this.cachedirCommand(command.params);

        else if (command.name === "update")
            await this.updateCommand(command.params);

        else if (command.name === "clean")
            await this.cleanCommand(command.params);

        else if (command.name === "version")
            await this.versionCommand();
        
        else await getHelp().then(text => console.log(chalk.grey(text)));
    }

    /**
     * Compile mods command
     */
    private async compileMods(params: (string | number)[]) {
        await this.requirePZPWProject();

        // Validate mods to compile
        const validModIds: string[] = [];
        const modIds = (params.length > 0) ? params : Object.keys(this.pzpwConfig.mods);
        for (const modId of modIds as string[]) {
            if (this.pzpwConfig.mods[modId]) validModIds.push(modId);
            else console.log(chalk.red(`Mod ${modId} is not found in this project!`));
        }

        if (validModIds.length === 0)
            throw chalk.red("No mod found to compile!\nCheck that mod IDs are set correctly in your project's pzpw-config.json");

        console.log(chalk.cyan(`Compiling ${validModIds.length} mod(s) [ ${validModIds.join(", ")} ]...`));

        await ModsCompiler(this.pzpwConfig, validModIds, this.settings.get("cachedir"));

        return validModIds;
    }

    /**
     * Compile workshop command
     */
    private async compileWorkshop(params: (string | number)[]) {
        await this.requirePZPWProject();

        const modIds = (params.length > 0) ? params : this.pzpwConfig.workshop.mods;
        await this.compileMods(modIds).catch(error => { throw error; });

        console.log(chalk.cyan("Compiling workshop..."));

        await WorkshopCompiler(this.pzpwConfig, this.settings.get("cachedir"));
    }

    /**
     * Get or set game cachedir path command
     */
    private async cachedirCommand(params: (string | number)[]) {
        if (!params[0] || params[0] === "get") {
            console.log("cachedir: ", chalk.cyanBright(this.settings.get("cachedir")));
        }

        else if (params[0] === "set") {
            const cachedir = params[1].toString();
            if (existsSync(cachedir)) {
                this.settings.set("cachedir", cachedir);
                this.settings.save();
                console.log(chalk.green(`cachedir is now "${cachedir}`));
            }
            else console.log(chalk.red(`Path "${cachedir}" doesn"t exist!`));
        }

        else if (params[0] === "unset") {
            const cachedir = join(homedir(), "Zomboid");
            this.settings.set("cachedir", cachedir);
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
        console.log(chalk.cyan("Updating PZPW Compiler..."));
        
        return new Promise<void>(resolve => {
            const module = (params[0]) ? params[0] : "pzpw-compiler";
            const buffer = execSync(`npm install -g ${module}`);
            console.log(chalk.gray(buffer.toString().trim()));
            resolve();
        });
    }

    /**
     * Clean project and cachedir command
     */
    private async cleanCommand(params: (string | number)[]) {
        await this.requirePZPWProject();
        
        // No param show some help
        if (!params[0])
            return console.log(chalk.gray(await getCommandHelp("clean", true)));

        const cachedir = this.settings.get<string>("cachedir");
        let pathToDelete: string[] = [];
        
        // Clean Mods
        if (params[0] === "all" || params[0] === "mods") {
            for(const modId of Object.keys(this.pzpwConfig.mods)) {
                const path = join(cachedir, "mods", modId);
                if (existsSync(path)) pathToDelete.push(path);
            }
        }
        
        // Clean Workshop
        if (params[0] === "all" || params[0] === "workshop") {
            const path = join(cachedir, "workshop", this.pzpwConfig.workshop.title);
            if (existsSync(path)) pathToDelete.push(path);
        }

        // Make sure we do not delete the whole directory
        pathToDelete = pathToDelete.filter(p => p != join(cachedir, "mods") && p != join(cachedir, "workshop"));

        // Print debug
        if (this.args.debug)
            console.log(cachedir, pathToDelete);

        // Deletes
        if (pathToDelete.length > 0) {
            for(const path of pathToDelete) {
                console.log(chalk.yellowBright(`- Deleting '${path}'...`));
                if (!this.args.dry) // don't delete if dry
                    await rm(path, { force: true, recursive: true });
            }
        }
        else console.log(chalk.gray("There is nothing to delete!"));
    }

    /**
     * Print the current version command
     */
    private async versionCommand() {
        await this.printIntro();
    }
}
