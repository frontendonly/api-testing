export const apiJson = {
    "name": "My Application",
    "envs": {
        "local": {
            "host": "https://localhost:8080",
            "path": "/api"
        },
        "prod": {
            "host": "https://api.frontendonly.com",
            "path": ""
        }
    },
    "auth": {
        "enable": false,
        "failFast": true,
        "request": {
            url: "https://openid.frontendonly.com/oauth/token",
            conf: {
                "headers": {}
            },
            beforeRequest: {
                requestDataMapping: [{
                    "key": "grant_type",
                    "value": "client_credentials"
                },
                {
                    "key": "client_id",
                    "value": "$.clientId"
                },
                {
                    "key": "client_secret",
                    "value": "$.clientSecret"
                },
                {
                    "key": "scope",
                    "value": "$.scope"
                }]
            }
        },
        store: [{
            "key": "authCredential",
            "value": "$.data"
        }],
        test: [{
            "title": "Authentication",
            "key": "statusCode",
            "operator": "eq",
            "value": 200
        }]
    },
    "concurrent": {
        "enabled": false,
        "rampup": 1,
        "every" : 1000,
        "max": 1000
    },
    "defaultContext": {
       "env": "local",
        "contextName": "CONTEXT_VALUE",
        "dynamicContext": "FO_%$.contextName%"
    },
    "specs": [{
        "name": "Test Login",
        "request": {
            "path": "/user/authorize",
            "conf": {
                "method": "POST",
                "body": {}
            },
            "beforeRequest": {
                "requestDataMapping": [{
                    "key": "email",
                    "value": "email"
                },
                {
                    "key": "password",
                    "value": "pwd"
                }]
            }
        },
        "store": [{
            "key": "accessToken",
            "value": "$.accessToken"
        }],
        "test": [{
            "title": "User able to login with correct credentials",
            "key": "$.accessToken",
            "operator": "def"
        }]
    }]
}