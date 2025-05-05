import fetch from "node-fetch";
import fs from "fs";
import path from 'path';
import { evaluateExpression, evaluateExpressions, getContext, withContext } from "./utils.js";

export class AgentRunnerApiTesting {
    static async init(name, config) {
        if (!name || typeof name !== 'string') {
            return console.log(`Name is required`);
        }

        try {
            const apiJson = JSON.parse(fs.readFileSync(path.resolve('core/template/sample.json')));
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

    static run(fileName) {
        const agentRunnerApiTesting = new this(fileName);
        agentRunnerApiTesting._run();
    }

    processLog = [];
    context = {};
    testingData = null;
    constructor(fileName = "api-testing.json") {
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
        console.log(`Running ${this.testingData.name} cases`);
        const specs = this.testingData.specs;
        if (!specs.length) {
            console.error(`No specs to run`);
            process.exit(0);
        }
        const processNames = [];
        const process = async () => {
            const action = specs.shift();
            if (!action) return this.allDone();
            if (!action.disabled) {
                if (!processNames.includes(action.name)) {
                    processNames.push(action.name)
                    console.log(`Test<${action.name}>`);
                    this.processLog.push({
                        startTime: +new Date(),
                        name: action.name,
                        passed: 0,
                        failed: 0,
                        payload: action.body,
                        requests: [],
                    });
                }

                const startTime = +new Date;
                const response = await this.fetch(action.request);
                this.assert(action, response, startTime);
            }
            process();
        };

        await process();
    }

    async fetch(req, withContextPath = true) {
        const env = this.testingData.envs[this.context.env];
        let url = withContext(`${env.host}${withContextPath ? env.contextPath : ""}${req.path || ""}`, this.context);
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
        let statusCode = 200;
        const response = await fetch(url, req.conf)
            .catch((err) => console.log(`${err}\n`))
            .then((res) => {
                statusCode = res.status;
                try {
                    return res.json();
                } catch (e) { }
                finally { }
            });

        return { statusCode, data : response || { message: 'Failed to process request' } };
    }

    allDone() {
        console.log(`\n\t------------------------`);
        console.log(
            this.processLog
                .map((item) => [`\n${item.name} :  Passed<${item.passed}> Failed<${item.failed}>`,
                    '------------------------------',
                item.requests.map(req => `${req.api} : <${req.passed ? 'Passed' : 'Failed'}> \n Request took ${req.took}ms\n${!req.passed ? JSON.stringify(req.error, null, 3) : ''}`).join('\n------------------------------\n')
                ].join('\n')
                ).join('\n')
        );
        console.log(`All Done, please check logs`);
    }

    /**
     * 
     * @param {*} action 
     * @param {*} response 
     * @param {*} startTime 
     */
    assert(action, response, startTime) {
        let allPassed = true;
        // evaluate success conditions        
        if (Array.isArray(action.test)) {
            for (const test of action.test) {
                const passed = evaluateExpression(test, response, this.context);
                console.log(`\t<${passed ? "Passed" : "Failed"}> ${test.title} `);
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
        const current = this.processLog[this.processLog.length - 1];
        if (current) {
            if (allPassed) current.passed++;
            else current.failed++;
            current.requests.push({
                api: `${action.request.conf.method.toUpperCase()}${action.request.path}`,
                passed: allPassed,
                took: +new Date() - startTime,
                error: (!allPassed ? response : null)
            });
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
        const swaggerDocs = await fetch(swaggerConfig.url).then(r => r.json());
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
                        spec: [{
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