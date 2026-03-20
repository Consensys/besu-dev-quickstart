import {renderTemplateDir, validateDirectoryExists, copyFilesDir} from "./fileRendering.js";
import { NetworkContext } from "./types/networkContext.js";
import { fileURLToPath } from 'url';
import path from "path";
import {Spinner} from "./spinner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 *
 * @param context
 */
export async function buildNetwork(context: NetworkContext): Promise<void> {
    // console.log(context);
    
    const templatesDirPath = path.resolve(__dirname, "..", "templates");
    const filesDirPath = path.resolve(__dirname, "..", "files");
    const spinner = new Spinner("");

    try {
        spinner.text = `Installing besu dev quickstart for a ${context.networkType} network at ${context.outputPath}`;
        spinner.start();

        const commonTemplatePath = path.resolve(templatesDirPath, "common");
        const networkTypeTemplatePath = path.resolve(templatesDirPath, context.networkType);

        const commonFilesPath = path.resolve(filesDirPath, "common");
        const networkFilesPath = path.resolve(filesDirPath, context.networkType);

        if (validateDirectoryExists(commonFilesPath)) {
            copyFilesDir(commonFilesPath, context);
        }

        if (validateDirectoryExists(networkFilesPath)) {
            copyFilesDir(networkFilesPath, context);
        }

        if (validateDirectoryExists(commonTemplatePath)) {
            renderTemplateDir(commonTemplatePath, context);
        }

        if (validateDirectoryExists(networkTypeTemplatePath)) {
            renderTemplateDir(networkTypeTemplatePath, context);
        }

        await spinner.succeed(`Installation complete.`);

        console.log();
        console.log(`To start your test network, run 'run.sh' in the directory, '${context.outputPath}'`);
    } catch (err) {
        if (spinner.isRunning) {
            await spinner.fail(`Installation failed. Error: ${(err as Error).message}`);
        }
        process.exit(1);
    }
}

