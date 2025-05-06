#!/usr/bin/env node
import minimist from 'minimist';
const args = minimist(process.argv);
import { AgentRunnerApiTesting } from "./core/core.class.js";
const commandName = args._[2];
// trigger testing
try {
    const runner  = AgentRunnerApiTesting[commandName];
    if (runner){
        const ckeys = Object.keys(args);
        const otherArgs = args._.slice(3);
        if (ckeys.length > 1){
            otherArgs.push(
                ckeys.reduce((accum, k) => (((k !== '_') ? (accum[k] = args[k]) : null), accum), {})
            );
        }
        
        runner.apply(AgentRunnerApiTesting, otherArgs);
    } else {
        console.log(`No command found for: ${commandName || 'unknown'}`);
        console.log([
            `Available commands are:`,
            "foat init <name> [--swagger.url=''] [--swager.startsWith='/api']",
            'foat run [Optional <testFilePath>] [--concurrent.rampup=1] [--concurrent.every=1000] [--concurrent.max=10] [--concurrent.enabled=false]'
        ].join('\n'));
    }
} catch (e) {    
    console.log(`Unable to process the request`);    
    process.exit(0);
}