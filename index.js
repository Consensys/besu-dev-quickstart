#!/usr/bin/env node
import { main } from "./build/index.js";

try {
    await main();
} catch (err) {
    if (err && err.stack && process.argv.length >= 3 && process.argv[2] === "--stackTraceOnError") {
        console.error(`Fatal error: ${err.stack}`);
    } else if (err && err.message) {
        console.error(`Fatal error: ${err.message}`);
    } else if (err) {
        console.error(`Fatal error: ${err}`);
    } else {
        console.error(`Fatal error: unknown`);
    }
    process.exit(1);
}
