# API-Testing

API-Testing is a simple and effective package designed to help developers configure and run API test cases easily. It streamlines the process of setting up API tests and executing them based on predefined configurations.


## Features

- **init <appName>**  
  Creates a sample API-testing configuration file named `api-testing.json` for the specified application. This file serves as a template to define your API test cases.

   ```bash
   atof init test-app --swagger.url='' --swagger.startsWith='/api'
   ```

- **run <testFilePath>**  
  Runs all configured test cases as defined in the specified `api-testing.json` file. This command executes the tests and helps you validate your API endpoints efficiently.

  ```bash
   atof run [Optional <testFilePath>]
  ```

## Installation
To install the API-Testing package, use npm:

```bash
npm install -g @frontendonly/api-testing
```

## Sample Configurarion
```json
{
   "name": "My Application",
   "envs": {
      "local": {
         "host": "https://localhost:8080",
         "contextPath": "/api"
      },
      "prod": {
         "host": "https://api.frontendonly.com",
         "contextPath": ""
      }
   },
   "defaultContext": {
      "env": "local",
      "contextName": "CONTEXT_VALUE",
      "dynamicContext": "FO_%$.contextName%"
   },
   "specs": [
      {
         "name": "Test Login",
         "request": {
            "path": "/user/authorize",
            "conf": {
               "method": "POST",
               "body": {}
            },
            "beforeRequest": {
               "requestDataMapping": [
                  {
                     "key": "email",
                     "value": "email"
                  },
                  {
                     "key": "password",
                     "value": "pwd"
                  }
               ]
            }
         },
         "store": [
            {
               "key": "accessToken",
               "value": "$.data.accessToken"
            }
         ],
         "test": [
            {
               "title": "User able to login with correct credentials",
               "key": "$.data.accessToken",
               "operator": "def"
            }
         ]
      }
   ]
}
```

## Test case Operators

**gt (greater than)**  
   Checks if the first value (`a`) is greater than the second value (`b`).  
   *Usage:* `operators.gt(5, 3)` returns `true`.

**lt (less than)**  
   Checks if the first value (`a`) is less than the second value (`b`).  
   *Usage:* `operators.lt(2, 4)` returns `true`.

**eq (equal)**  
   Checks if the first value (`a`) is equal to the second value (`b`).  
   *Usage:* `operators.eq(5, 5)` returns `true`.

**not (not equal)**  
   Checks if the first value (`a`) is not equal to the second value (`b`).  
   *Usage:* `operators.not(5, 3)` returns `true`.

**gte (greater than or equal to)**  
   Checks if the first value (`a`) is greater than or equal to the second value (`b`).  
   *Usage:* `operators.gte(5, 5)` returns `true`.

**lte (less than or equal to)**  
   Checks if the first value (`a`) is less than or equal to the second value (`b`).  
   *Usage:* `operators.lte(3, 5)` returns `true`.

**def (defined)**  
   Checks if the first value (`a`) is not `undefined`.  
   *Usage:* `operators.def(5)` returns `true`.

**notdef (not defined)**  
   Checks if the first value (`a`) is `undefined`.  
   *Usage:* `operators.notdef(undefined)` returns `true`.

