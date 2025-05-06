import fetch from "node-fetch";
import fs from "fs";
import path from 'path';
import { evaluateExpression, evaluateExpressions, getContext, withContext } from "./utils.js";
import { apiJson } from './template/sample.js';

export class AgentRunnerApiTesting {
    static async init(name, config) {
        if (!name || typeof name !== 'string') {
            return console.log(`Name is required`);
        }

        try {
            // load from swagger url
            if (config.swagger && config.swagger) {
                // write the swaggerConfig to apiJson 
                await this.loadSwaggerDocs(config.swagger, apiJson);
            }

            // generate a sample test case
            console.log(`Saving generated configuration to api-testing.json`);
            fs.writeFileSync('api-testing.json', JSON.stringify(Object.assign(apiJson, { name }), null, 3));
        } catch (e) {
            console.log(e);
        }
    }

    /**
     * 
     * @param {*} filePath 
     * @param {*} concurrent 
     * @returns 
     */
    static run(filePath = "api-testing.json", concurrent) {
        if (!fs.existsSync(filePath)) {
            return console.log(`Unable to perform run action due to missing ${filePath} file`);
        }

        const agentRunnerApiTesting = new this(filePath);
        agentRunnerApiTesting._run(concurrent);
    }

    process = {
        host: '',
        startTime: +new Date,
        endTime: null,
        logs: []
    };
    context = {};
    testingData = null;
    constructor(filePath) {
        console.log(`Retrieving Test File and initializing test suite`);
        console.log(`Reading file ${filePath}`);
        this.testingData = JSON.parse(fs.readFileSync(filePath));
        // set the default context        
        this.setContext("currentDate", new Date().toLocaleDateString().split("/").reverse().join(""));
        this.setContext("currentTime", new Date().toLocaleTimeString());
        if (this.testingData.defaultContext) {
            console.log(`Setting default Context`);
            for (const key in this.testingData.defaultContext) {
                let value = this.testingData.defaultContext[key];
                if (value && typeof value == 'object') {
                    value = JSON.parse(JSON.stringify(withContext(value, this.context)));
                } else {
                    value = withContext(value, this.context);
                }

                this.setContext(key, value);
            }
        }
    }

    async authenticate() {
        const auth = this.testingData.auth;
        const logObj = {
            logs: []
        };

        const startTime = +new Date;
        const response = await this.fetch(auth.request, logObj);
        const passed = this.assert(auth, response, startTime, logObj);
        if (!passed && auth.failFast) {
            return console.log(`Failed to Authenticate user. Stopping all ${this.testingData.specs.length} test cases`);
        }
    }


    async _run(concurrent) {
        // check if authentication is registered and enabled
        if (this.testingData.auth && this.testingData.auth.enabled) {
            await this.authenticate();
        }

        console.log(`Running ${this.testingData.name} cases`);
        if (!this.testingData.specs.length) {
            console.error(`No specs to run!`);
            process.exit(0);
        }

        const logObject = (msg) => ({
            processed: [],
            logs: [msg]
        });

        const env = this.testingData.envs[this.context.env];
        this.process.host = `${env.host}${env.contextPath || ''}`;
        concurrent = Object.assign(this.testingData.concurrent || {}, concurrent || {});
        const process = async (specs, next, logObj) => {
            const action = specs.shift();
            if (!action) {
                console.log(`\n${logObj.logs.join('\n')}`);
                return next();
            }

            if (!action.disabled) {
                if (!logObj.processed.includes(action.name)) {
                    logObj.processed.push(action.name)
                    logObj.logs.push(`Test<${action.name}>`);
                    this.process.logs.push({
                        startTime: +new Date(),
                        name: action.name,
                        passed: 0,
                        failed: 0,
                        payload: action.body,
                        requests: [],
                    });
                }

                const startTime = +new Date;
                const response = await this.fetch(action.request, logObj);
                this.assert(action, response, startTime, logObj);
            }

            process(specs, next, logObj);
        };

        if (!concurrent?.enabled) {
            await process(this.testingData.specs.slice(), () => this.allDone(), logObject(`Running 1 of 1 concurrent session.`));
        } else {
            // concurrent testing enabled
            console.log(`Performing  ${concurrent.max * concurrent.rampup} concurrent user sessions, ramping ${concurrent.rampup} users every ${concurrent.every / 1000} second(s) `);
            let totalSessions = concurrent.max;
            let allProcessed = 0;
            let totalRan = 0;
            await new Promise((resolve) => {
                const next = () => {
                    ++allProcessed;
                    if ((concurrent.max * concurrent.rampup) == allProcessed) {
                        resolve();
                        this.allDone();
                    }
                };

                const intervalId = setInterval(() => {
                    if (totalSessions) {
                        for (let i = 0; i < concurrent.rampup; i++) {
                            totalRan++;
                            process(this.testingData.specs.slice(), next, logObject(`Running ${totalRan} of ${(concurrent.max * concurrent.rampup)} concurrent session`));
                        }

                        totalSessions--;
                    } else {
                        clearInterval(intervalId);
                    }
                }, concurrent.every || 1000);
            });
        }
    }

    /**
     * 
     * @param {*} req 
     * @param {*} withContextPath 
     * @param {*} logObj 
     * @returns 
     */
    async fetch(req, logObj) {
        let url = withContext(`${req.url || this.process.host}${req.path || ""}`, this.context);
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
        let statusCode = 500;
        let failedRequest = false;
        const response = await fetch(url, req.conf)
            .catch((err) => {
                logObj.logs.push(`${err}\n`);
                failedRequest = true;
            })
            .then((res) => {
                try {
                    statusCode = res?.status || 500;
                    return res.json();
                } catch (e) { }
                finally { }
            });

        return { statusCode, data: response || { message: 'Failed to process request' }, failedRequest };
    }

    allDone() {
        this.process.endTime = Date.now();
        console.log(`\n\t------------------------`);
        console.log(
            this.process.logs
                .map((item) => [`\n${item.name} :  Passed<${item.passed}> Failed<${item.failed}>`,
                    '------------------------------',
                item.requests.map(req => `${req.api} : <${req.passed ? 'Passed' : 'Failed'}> \n Request took ${req.took}ms\n${!req.passed ? JSON.stringify(req.error, null, 3) : ''}`).join('\n------------------------------\n')
                ].join('\n')
                ).join('\n')
        );
        console.log(`All Done, please check logs`);

        // save records
        fs.writeFileSync('test_output.json', JSON.stringify(this.process, null, 3));
    }

    /**
     * 
     * @param {*} action 
     * @param {*} response 
     * @param {*} startTime 
     * @param {*} logObj 
     */
    assert(action, response, startTime, logObj) {
        let allPassed = true;
        // evaluate success conditions        
        if (Array.isArray(action.test)) {
            for (const test of action.test) {
                const passed = evaluateExpression(test, response, this.context);
                logObj.logs.push(`\t<${passed ? "Passed" : "Failed"}> ${test.title} `);
                if (!passed) {
                    allPassed = false;
                }
            }
        }

        // save context for next request        
        if (allPassed && action.store) {
            for (const store of action.store) {
                const value = store.value ? getContext(store.value, response.data) : response.data;
                this.setContext(store.key, value);
            }
        }
        const current = this.process.logs[this.process.logs.length - 1];
        if (current) {
            if (allPassed) current.passed++;
            else current.failed++;
            current.requests.push({
                api: `${(action.request.conf?.method || 'GET').toUpperCase()}${action.request.path}`,
                passed: allPassed,
                took: +new Date() - startTime,
                error: (!allPassed ? response : null)
            });
        }

        return allPassed;
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

    /**
     * @param {*} swaggerConfig 
     * {
     *   url: 'https://url_to_swagger',
     *   startsWith: 'api/'
     * }
     * @param {*} apiJson 
     */
    static async loadSwaggerDocs(swaggerConfig, apiJson) {
        console.log(`Loading swagger docs`);
        const swaggerDocs = await fetch(swaggerConfig.url).then(r => r.json()).catch(err => console.error(err.message));
        if (!swaggerDocs) {
            console.log(`Unable to load swagger docs from ${swaggerConfig.url}`);
            return;
        }

        console.log(`${swaggerDocs.info.title}`);
        console.log(`${swaggerDocs.info.description || 'No description'}`);
        const putContext = (name, type) => {
            const types = {
                string: "",
                array: [],
                object: {},
                number: 0
            };
            // set the context
            apiJson.defaultContext[name] = types[type];
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
                const contentType = Object.keys(req.requestBody.content).find(type => type.includes("application/json"));
                if (!contentType) return [];
                const schemaPath = `$.${req.requestBody.content[contentType].schema.$ref.substr(2).replaceAll("/", ".")}`;
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

        // empty specs
        apiJson.specs = [];
        for (let cpath of Object.keys(swaggerDocs.paths)) {
            if (!swaggerConfig.startsWith || cpath.startsWith(swaggerConfig.startsWith)) {
                for (const method in swaggerDocs.paths[cpath]) {
                    console.log(`Writting ${method}${cpath}`)
                    const req = swaggerDocs.paths[cpath][method];
                    // push the new config to our spec
                    apiJson.specs.push({
                        name: req.name || req.tags[0],
                        request: {
                            path: cpath.replaceAll(/{(.*)}/g, (a, b) => `%$.${b}%`),
                            conf: {
                                method: method.toLocaleUpperCase()
                            },
                            beforeRequest: {
                                requestDataMapping: getRequestMapping(req)
                            }
                        },
                        test: [{
                            'title': 'StatusCode should be 200',
                            key: "$.statusCode",
                            operator: 'eq',
                            value: 200
                        }]
                    });
                }
            }
        }
    }
}