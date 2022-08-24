import chalk from "chalk";
import { basename, join } from "path";
import { PZPWConfig } from "pzpw-config-schema";
import { copyFile, mkdir, readFile, rm, writeFile } from "fs/promises";
import { copyDirRecursiveTo } from "../utils.js";

/**
 * Generate the workshop txt file
 */
async function generateWorkshopTxt(pzpwConfig: PZPWConfig) {
    console.log(chalk.yellowBright("- Generating 'workshop/workshop.txt'..."));
    
    let content = "version=1\r\n";
    Object.keys(pzpwConfig.workshop).forEach((key: string) => {
        if (pzpwConfig.workshop[key] != null) {
            if (key === "id" && pzpwConfig.workshop[key] == -1 ) return;
            if (key === "mods") return; // ignore the mods array

            const obj = pzpwConfig.workshop[key];
            let value;
            if (Array.isArray(obj)) {
                if (obj.length > 0) value = obj.join(";");
            }
            else value = obj;

            if (value) content += `${key}=${value}\r\n`;
        }
    });

    // Set workshop description
    const description: string = await readFile("assets/workshop/description.txt", "utf-8");
    const descriptionLines = description.split("\r\n");
    descriptionLines.forEach(line => {
        content += "description=" + line + "\r\n";
    });

    await writeFile("workshop/workshop.txt", content)
        .catch(() => console.error(chalk.red("Error while writing 'workshop/workshop.txt'")));
}

export async function WorkshopCompiler(pzpwConfig: PZPWConfig, cachedir: string) {
    // Prepare workshop directory
    console.log(chalk.yellowBright("- Deleting directory 'workshop'..."));
    await rm("workshop", { force: true, recursive: true });
    console.log(chalk.yellowBright("- Creating directory 'workshop/Contents/mods/'..."));
    await mkdir(join("workshop/Contents/mods/"), { recursive: true });

    // Generate workshop.txt
    await generateWorkshopTxt(pzpwConfig);

    // Copy preview into workshop directory
    const previewImagePath = join("assets/workshop/preview.png");
    console.log(chalk.yellowBright(`- Copying preview image '${basename(previewImagePath)}' to 'workshop/${basename(previewImagePath)}'...`));
    await copyFile(previewImagePath, join("workshop", basename(previewImagePath)));

    // Copy mods into workshop mods directory
    console.log(chalk.yellowBright("- Copying generated mods to 'workshop/Contents/mods/'..."));
    await copyDirRecursiveTo("dist", "workshop/Contents/mods/");

    // Copy generated workshop directory to cachedir
    if (pzpwConfig.workshop.title.length === 0) throw chalk.red("You must set a workshop title into 'pzpw-config.json'!");
    const inPath = join("workshop");
    const outPath = join(cachedir, "Workshop", pzpwConfig.workshop.title);
    console.log(chalk.yellowBright(`- Copying '${inPath}' to '${outPath}'...`));
    await copyDirRecursiveTo(inPath, outPath);
}
