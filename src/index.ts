#!/usr/bin/env node
import { rootQuestion } from "./questions/index.js";
import { fileURLToPath } from 'url';
import { QuestionRenderer } from "./questionRenderer.js";
import { NetworkContext } from "./types/networkContext.js";
import { buildNetwork } from "./networkBuilder.js";
import yargs from 'yargs/yargs';
import chalk from 'chalk';

/**
 *
 */
export async function main(): Promise<void> {
    if (process.platform === "win32") {
        console.error(chalk.red(
            "Unfortunately this tool is not compatible with Windows at the moment.\n" +
            "We recommend running it under Windows Subsystem For Linux 2 with Docker Desktop.\n" +
            "Please visit the following pages for installation instructions.\n\n" +
            "https://docs.microsoft.com/en-us/windows/wsl/install-win10\n" +
            "https://docs.docker.com/docker-for-windows/wsl/"
        ));
        process.exit(1);
    }

    let answers = {};

    // if attempting this via cli and not interactive
    if(process.argv.slice(2).length > 0){
      console.log("Using the cli ...");  
      const args = await yargs(process.argv.slice(2)).options({
        networkType: { type: 'string', demandOption: true, choices:['public','private'], describe: 'Type of network to use.' },
        networkName: { type: 'string', demandOption: false, choices:['mainnet','hoodi','sepolia'], describe: 'Public network to connect to (required when networkType is public).' },
        otel: { type: 'boolean', demandOption: false, default: false, describe: 'Add Otel Collector spans to Grafana (private only).' },
        chainlens: { type: 'boolean', demandOption: false, default: false, describe: 'Enable the Chainlens explorer (private only).' },
        outputPath: { type: 'string', demandOption: false, default: './besu-test-network', describe: 'Location for config files.'}
      }).check((argv) => {
        if (argv.networkType === 'public' && !argv.networkName) {
          throw new Error('--networkName is required when --networkType is public');
        }
        return true;
      }).argv;

      answers = {
        networkType: args.networkType,
        networkName: args.networkName,
        otel: args.otel,
        chainlens: args.chainlens,
        outputPath: args.outputPath,
      };

    } else{

      // use the interactive questions here
      console.log("Using the interactive questions ...");  
      const qr = new QuestionRenderer(rootQuestion);
      answers = await qr.render();
    }

    await buildNetwork(answers as NetworkContext);
    setTimeout(() => {
        process.exit(0);
    }, 500);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    // note: main returns a Promise<void>, but we don't need to do anything
    // special with it, so we use the void operator to indicate to eslint that
    // we left this dangling intentionally...
    try {
        void main();
    } catch (err) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (err && err.stack && process.argv.length >= 3 && process.argv[2] === "--stackTraceOnError") {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            console.error(`Fatal error: ${err.stack as string}`);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        } else if (err && err.message) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            console.error(`Fatal error: ${err.message as string}`);
        } else if (err) {
            console.error(`Fatal error: ${err as string}`);
        } else {
            console.error(`Fatal error: unknown`);
        }
        process.exit(1);
    }
}
