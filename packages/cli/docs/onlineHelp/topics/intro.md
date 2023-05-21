# cenv

> A well considered monorepo cli and Node.js library for assisting with application and infrastructure configuration management.

`Cenv` inspects your packages and looks for specific conventions to identify `cenv modules` within each package. There are currently 3 different types of cenv modules, PARAMS, DOCKER, and STACK. A package must have at least one cenv module in order to take advantage of the cenv tool. The params module is backed by AWS AppConfig and AWS Parameter store and provides a mechanism for application parameter configuration and management. The docker provides a mechanism to create an AWS ECR repository for the package containers and build and push the packages containers to the repo. Finally, the stack module uses AWS Cdk to deploy cloudformation stacks representing the infrastructure and applications contained in the packages.

## yarn workspaces

Cenv uses yarn workspaces to manage packages and their dependencies. In order to control which packages are picked up by yarn workspaces you configure the `workspaces` property of the monorepo's package.json.

```json
{
  "name": "some-monorepo-package-name",
  ...
  "workspaces": {
    "packages": [
      "packages/*",
      "packages/apps/*"
    ]
  }
}
```

Yarn workspaces hoists your node dependencies in the node_modules directory. This means that all the dependencies for your entire monorepo are only pulled down once. This reduces the amount of data on the drive, duplicated libraries, and managing different dependency conflicts on each workspace. If for some reason you need the dependencies installed in the node_modules directory of a specific workspace you can use the nohoist option.

```json
{
  "name": "some-monorepo-package-name",
  ...
  "workspaces": {
    "packages": [
     ...
    ],
    "nohoist": [
      "**/materialization"
    ]
  }
}
```

## Cheat Sheet Commands

### cenv deploy

Commonly used options:

```shell
cenv deploy [suite] [...application] [--parameters] [--stack] [--docker] [--cenv] [--dependencies]
```

Deploy all modules for all packages in the curb-cloud suite. The suite is defined in the suites.json monorepo. Will use the UI by default.

```shell
cenv deploy curb-cloud
```

Deploy just the packages module for all packages in curb-cloud and . The suite is defined in the suites.json monorepo.

```shell
cenv deploy curb-cloud --packages --cli
```

Create ECR repos build and deploy docker container for @stoked-cenv/core-middleware-service as well as all of the docker containers it depends on.

```shell
cenv deploy @stoked-cenv/core-middleware-service --docker -d
```

### cenv destroy

-p, --parameters              Destroy parameters
-s, --stack                   Destroy stack
-cenv, --cenv                 Destroy cenv components from an aws account.
-g, --global                  Destroy global parameters, ecr images, and cenv components after everything else is gone
--profile, <profile>          Environment profile to use on deployments. (default: "default")
-d, --dependencies            This flag uses the settings in the deploy package.json for dockerDependencies and componentDependencies. It
will build any docker dependencies listed and install and component dependencies listed before installing
the specificed package.
-sv, --strict-versions        Do not create new docker containers if the current version number exists.
-cli, --cli                   Use the cli
-ui, --user-interface         Use the ui
-fe, --fail-on-error          Mark the package as failed if any commands have errors
-p, --parameters              Only run  parameter related commands.
-D, --docker                  Only run docker related commands.
-h, --help                    display help for command

### cenv exec [...args]

This command wraps any commands that follow it with the currently configured exports so for instance from your terminal you can run a shell script that requires your the current environments exports like the following:

```shell
$ cenv exec ./someScript
export AWS_PROFILE=local
export AWS_REGION=us-east-1
export ENV=local
export ROOT_DOMAIN=localhost
export AWS_ACCESS_KEY_ID=****
export AWS_SECRET_ACCESS_KEY=****
export AWS_ENDPOINT=http://localhost:4566
export CDK_DEFAULT_ACCOUNT=000000000000
export CDK_DEFAULT_REGION=us-east-1
caladan:deploy stoked$ ./someScript
```

If there are any - characters in the command that is being wrapped surround the command in double quotes e.g.:

```shell
caladan:deploy stoked$ cenv exec "cdk deploy --require-approval never"
CENV_LOG_LEVEL=INFO
export AWS_PROFILE=architecture
export AWS_REGION=us-east-1
export ENV=dev
export ROOT_DOMAIN=bstoker.elevationcurb.com
export AWS_ACCESS_KEY_ID=****
export AWS_SECRET_ACCESS_KEY=****
export CDK_DEFAULT_ACCOUNT=971995203899
export CDK_DEFAULT_REGION=us-east-1
caladan:deploy stoked$ cdk deploy --require-approval never

✨  Synthesis time: 3.47s

dev-core-middleware-service: building assets...
...
```

### cenv params

```shell
# show your currently configured params
$ cenv params
APPLICATION_NAME: @stoked-cenv/new-service
SOMEAPPVAR: someAppVal
ENVIRONMENT_NAME: dev
SOMEENVVAR: someEnvVal
SOMEGLOBALVAR: someGlobalVal

# show your currently configured params with extra metadata
$ cenv params -d
APPLICATION_NAME:
  Value: @stoked-cenv/new-service
  Path: /service/ec/new-service/app/application/name
  Type: String
SOMEAPPVAR:
  Value: someAppVal
  Path: /service/ec/new-service/app/someappvar
  Type: String
ENVIRONMENT_NAME:
  Value: dev
  Path: /service/ec/new-service/environment/dev/environment/name
  Type: String
SOMEENVVAR:
  Value: someEnvVal
  Path: /service/ec/new-service/environment/dev/someenvvar
  Type: String
SOMEGLOBALVAR:
  Value: someGlobalVal
  Path: /global/someglobalvar
  Type: String
```

It is important to remember that there may be a difference between the parameters you've configured and the ones that are deployed currently. In order to demonstrate this we'll update a parameter and then show the latest configured params and then the currently deployed params.

```shell
$ cenv update -a someappvar someupdatedVal
- updating parameter someappvar with value someupdatedVal
 - saving .cenv
 - saving .cenv.dev
 - saving .cenv.globals

# show the latest configured params
$ cenv params
APPLICATION_NAME: @stoked-cenv/new-service
SOMEAPPVAR: someupdatedVal
ENVIRONMENT_NAME: dev
SOMEENVVAR: someEnvVal
SOMEGLOBALVAR: someGlobalVal

# show the latest deployed params
$ cenv params -D
*******************************************************************
*********************** INITIAL CONFIG VARS ***********************
*******************************************************************

APPLICATION_NAME: "@stoked-cenv/new-service"
SOMEAPPVAR: someAppVal
ENVIRONMENT_NAME: dev
SOMEENVVAR: someEnvVal
SOMEGLOBALVAR: someGlobalVal

*******************************************************************

# deploy the latest
$ cenv deploy
deploying @stoked-cenv/new-service configuration to environment dev

# now show the latest deployed params (notice the someappvar has the latest value)
$ cenv params -D
*******************************************************************
*********************** INITIAL CONFIG VARS ***********************
*******************************************************************

APPLICATION_NAME: "@stoked-cenv/new-service"
SOMEAPPVAR: someupdatedVal
ENVIRONMENT_NAME: dev
SOMEENVVAR: someEnvVal
SOMEGLOBALVAR: someGlobalVal

*******************************************************************
```

### encryption

Configure the curb-key for this account

```shell
$ cenv config -k
AWS_PROFILE: (architecture)
AWS_REGION: (us-east-1)
ENV: (dev)
ROOT_DOMAIN: (bstoker.elevationcurb.com)
KMS_KEY: arn:aws:kms:us-east-1:971995203899:key/mrk-370898c4c63846bb942c242aef5cdb3f
```

Create an encrypted param

```shell
$ cenv add -a -enc encryptedVar encryptedVal
- writing parameter encryptedvar with value --ENC=AQICAHjkqF+ZjkGsMGlSi1uxDcRNBU3E/Q197+RVLOnIGVn86gGQeOCdonNUP5W00dTIHFH0AAAAbDBqBgkqhkiG9w0BBwagXTBbAgEAMFYGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQMz5ChRQkgJ+ABDrqvAgEQgCnU6vaMglYwDXzzBj5bUHuR9Tgw//effvVn3G6eQmucJt9L+o0627QhLg==
 - saving .cenv
 - saving .cenv.dev.globals
```

View the decrypted version of the param

```shell
$ cenv params -enc false
APPLICATION_NAME: @stoked-cenv/hello-world-node
ENCRYPTEDVAR: "encryptedVal"
```


### cross account encryption

One account needs to

## cenv file types

| File Type                  | Name                              | Purpose                                                                                                                  |
|----------------------------|-----------------------------------|--------------------------------------------------------------------------------------------------------------------------|
| .cenv                      | Application Variables File        | Contains application variables as well as references to globals and environment globals that are required by the service |
| .cenv.[ENV]                | Environment Variables File        | Contains environment variables                                                                                           |
| .cenv.env.template         | Environment Variables Template    | Used to generate the initial set of environment variables for a new environment                                          |
| .cenv.[ENV].env.globals    | Environment Globals Variable File | Contains the environment                                                                                                 |
| .cenv.env.globals.template | Environment Globals Template File | Used to generate the inital set of environment global variables for a new environment                                    |
| .cenv.globals              | Globals Variable File             | Contains global variables                                                                                                |
| .cenv.[ENV].config         | Environment Config                | Contains AWS AppConfig identifier's used to deploy new versions of a services parameters                                 |


## Support

Call your congressperson.

## Stay in touch

- Author - [Brian Stoker](mailto:bstoker@poweredbyelevation.com)

## License

cenv is NOT [MIT licensed](LICENSE) (but it should be
🙄).
