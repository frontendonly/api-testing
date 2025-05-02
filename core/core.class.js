import fetch from "node-fetch";
import fs from "fs";
import { evaluateExpression, evaluateExpressions, getContext, withContext} from "./utils.js";

export class AgentRunnerApiTesting {
    static init(name){
        const apiJsonSample = {
            name: name || 'My Application',
            swagger: {
                enabled: false,
                path: '/v3/api-docs',
                startsWith: ''
            },
            envs: {
                local: {
                    host: 'https://localhost:8080',
                    path: '/api'
                },
                prod: {
                    host: 'https://api.frontendonly.com',
                    path: ''
                }
            },
            defaultContext: {
                env: 'local',
                contextName: 'CONTEXT_VALUE',
                dynamicContext: 'FO_%$.contextName%'
            },
            actions: [{
                name: "Test Login",
                request: {
                    path: '/user/authorize',
                    conf: {
                        method: 'POST',
                        body: {}
                    },
                    beforeRequest: {
                        requestDataMapping: [{
                            key: "email",
                            value: "email"
                        },
                        {
                            key: "password",
                            value: "pwd"
                        }]
                    }
                },
                store: [{
                    key: "accessToken",
                    value: "$.accessToken"
                }],
                test: [{
                    title: "User able to login with correct credentials",
                    key: "$.accessToken",
                    operator: "def"
                }]
            }]
        };

        // generate a sample test case
        fs.writeFileSync('api-testing.json', JSON.stringify(apiJsonSample, null, 3));
    }

    static run(fileName){
        const agentRunnerApiTesting = new this(fileName);
        agentRunnerApiTesting._run();
    }

    processLog = [];
    context = {};
    testingData = null;
    constructor(fileName = "api-testing.json"){
        console.log(`Retrieving Test File and initializing test suite`);
        console.log(`Reading file ${fileName}`);
        this.testingData = JSON.parse(fs.readFileSync(fileName));
        // set the default context        
        this.setContext("currentDate", new Date().toLocaleDateString().split("/").reverse().join(""));
        this.setContext("currentTime", new Date().toLocaleTimeString());
        if (this.testingData.defaultContext) {
            console.log(`Setting default Context`);
            for (const key in this.testingData.defaultContext) {
                this.setContext(key, withContext(this.testingData.defaultContext[key], this.context));
            }
        }
    }


    async _run() {
        const swaggerConfig = this.testingData.swagger;
        if (swaggerConfig && swaggerConfig.enabled) {
            console.log(`Swagger loader enabled`);
            await this.loadSwaggerDocs(swaggerConfig);
        }
        console.log(`Running ${this.testingData.name} cases`);
        const actions = this.testingData.actions;
        if (!actions.length) {
            console.error(`No actions to run`);
            process.exit(0);
        }
        const process = async () => {
            const action = actions.shift();
            if (!action) return this.allDone();
            if (!action.disabled) {
                console.log(`Test<${action.name}>`);
                this.processLog.push({
                    startTime: +new Date(),
                    name: action.name,
                    passed: false,
                    payload: action.body,
                    childProcess: [],
                });
                const response = await this.fetch(action.request);
                this.assert(action, response);
            }
            process();
        };

        await process();
    }

    async fetch(req, withContextPath = true) {
        const env = this.testingData.envs[this.context.env];
        let url = withContext(`${env.host}${withContextPath ? env.context : ""}${req.path || ""}`, this.context);
        this.processBeforeRequest(req);
        if ((req.conf.method || 'GET').toLowerCase() == 'post') {
            req.conf.body = JSON.stringify(req.conf.body);
        } else {
            const urlWithParams = new URL(url);
            Object.keys(req.conf?.body || {}).forEach(key => {
                urlWithParams.searchParams.append(key, req.conf.body[key]);
            });
            url = urlWithParams.toString();
            // remove the body prop            
            delete req.conf.body;
        }
        // perform request        
        const response = await fetch(url, req.conf)
            .catch((err) => console.log(`${err}\n`))
            .then((res) => {
                try {
                    return res.json();
                } catch (e) { }
            });
        return response;
    }

    allDone() {
        console.log(
            this.processLog
                .map((item) => (`\n<${item.passed ? 'Passed' : 'Failed'}> : ${item.name}\nRequest took ${item.took}\n${!item.passed ? JSON.stringify(item.error, null, 3) : ''}`
                )).join('n')
        );
        console.log(`All Done, please check logs`);
    }
    assert(action, response) {
        let allPassed = true;
        // evaluate success conditions        
        if (Array.isArray(action.test)) {
            for (const test of action.test) {
                const passed = evaluateExpression(test, response, this.context);
                console.log(`t<${passed ? "Passed" : "Failed"}> ${test.title} `);
                if (!passed) {
                    allPassed = false;
                }
            }
        }

        // save context for next request        
        if (allPassed && action.store) {
            for (const store of action.store) {
                const value = store.value ? getContext(store.value, response) : response;
                this.setContext(store.key, value);
            }
        }
        const current = this.processLog[this.processLog.length - 1];
        if (current) {
            current.passed = allPassed;
            current.endTime = +new Date();
            current.took = current.endTime - current.startTime;
            if (!allPassed) {
                current.error = response || {message: 'Failed to process request'};
            }
        }
    }

    setContext(key, value) {
        console.log(`Writing key<${key}> to context`);
        this.context[key] = value;
    }

    getContext(key) {
        return this.context[key];
    }

    processBeforeRequest(request) {
        if (!request.beforeRequest) return;
        const tasks = {
            requestDataMapping: (requestMapping) => {
                if (Array.isArray(requestMapping)) {
                    const data = requestMapping.reduce((accum, item) => {
                        if (evaluateExpressions(item.conditions, this.context)) {
                            const value = getContext(item.value, this.context);
                            accum[item.key] = value == undefined ? "" : value;
                        }
                        return accum;
                    }, {});
                    // write the req body                    
                    request.conf.body = data;
                }
            },
        };

        for (const key in request.beforeRequest) {
            tasks[key](request.beforeRequest[key]);
        }
    }

    async loadSwaggerDocs(swaggerConfig) {
        console.log(`Loading swagger docs`);
        const swaggerDocs = await this.fetch(swaggerConfig, false);
        if (swaggerDocs) {
            console.log(`${swaggerDocs.info.title}`);
            console.log(`${swaggerDocs.info.description}`);
        }

        const defaultContext = {};
        const putContext = (name, type) => {
            const types = {
                string: "",
                array: [],
                object: {},
                number: 0
            };
            defaultContext[name] = types[type];
        };

        const getRequestMapping = (req) => {
            if (req.parameters) {
                return req.parameters.filter(item => (item.in !== 'path'))
                    .map((item) => {
                        putContext(item.name, item.schema.type);
                        return {
                            key: item.name,
                            value: `$.${item.name}`,
                        };
                    });
            } else if (req.requestBody) {
                const schemaPath = `$.${req.requestBody.content["application/json"].schema.$ref.substr(2).replaceAll("/", ".")}`;
                const schema = getContext(schemaPath, swaggerDocs);
                return Object.keys(schema?.properties || {}).map((name) => {
                    putContext(name, schema.properties[name].type);
                    return {
                        key: name,
                        value: `$.${name}`,
                    };
                });
            }
        };

        const actions = Object.keys(swaggerDocs.paths).reduce((accum, path) => {
            if (!swaggerConfig.startsWith || path.startsWith(swaggerConfig.startsWith)) {
                Object.keys(swaggerDocs.paths[path]).forEach((method) => {
                    const req = swaggerDocs.paths[path][method];
                    path = path.replaceAll(/{(.*)}/g, (a, b) => `%$.${b}%`);
                    accum.push({
                        name: req.name || req.tags[0],
                        request: {
                            path: `${path}`,
                            conf: {
                                method: method.toLocaleUpperCase()
                            },
                            beforeRequest: {
                                requestDataMapping: getRequestMapping(req)
                            }
                        }
                    });
                });
            }
            return accum;
        }, []);

        console.log(JSON.stringify({ defaultContext, actions }, null, 3));
        process.exit(0);
    }
}