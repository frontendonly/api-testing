import minimist from 'minimist';
const args = minimist(process.argv);
import { AgentRunnerApiTesting } from "./core/core.class.js";
const commandName = args._[2];
let otherArgs = args._.splice(3);
    // trigger testing
    try {
        const runner  = AgentRunnerApiTesting[commandName];
        if (runner){
            runner.apply(AgentRunnerApiTesting, otherArgs);
        } else {
            console.log(`No command found for: ${commandName}`);
            console.log(`Available commands are: init<name> | run<appName>`);
        }
    } catch (e) {    
        console.log(`Unable to process the request`);    
        process.exit(0);
    }