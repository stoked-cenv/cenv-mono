# getting started

## Build and Install

```bash
# from mono root
$ yarn run install-cenv

# or from any where within the mono repo

$ lerna bootstrap
$ lerna exec --scope @stoked-cenv/cenv -- npm run build
```

## Running the cli
```bash
# executing the cli
$ cenv

Usage: cenv [options] [command]

Options:
  -h, --help                          display help for command

Commands:
  pull [options] [options]            Pull the latest application configuration
  init [options]                      Init a new or existing application configuration
  clean                               Clean currently configured local files related to data in the .cenv configuration
  deploy [options]                    Initialize this application to an existing application config
  push [options]                      Push locally updated application configuration variables
  add|update [options] <key> [value]
  rm [options] [key] [moreKeys...]
  install [options]                   Install the infrastructure for the base application. Once this is complete it is ready for use with any other application.
  env [options] [environment]         Manage application environments with this command
  destroy [options] [...application]  Destroy the infrastructure for the base application. Once this is complete it is ready for use with any other application.
  params [options]
  app                                 Manage AWS AppConfig resources directly.. indirectly
  uninstall                           Uninstall the infrastructure for the base cenv application which all other app will depend on for materialization.
  configure [options]                 Configure the cli for a specific deployment.
  help [command]                      display help for command
```

## Configuring the cli

```shell
# set the default configuration for cenv
$ cenv configure

# aws profile used to access the aws account you are deploying to.. if one doesn't already exist run "aws configure" first
AWS_PROFILE: (architecture)

# environment region
AWS_REGION: (us-east-1)

# environment name
ENV: (dev)

# this value needs to be the same as your assigned [subdomain].elevationcurb.com hosted zone for AWS deployments
ROOT_DOMAIN: (bstoker.elevationcurb.com)
```

## Configuring the cli for multiple environments

```shell
# set a named configuration for cenv
$ cenv configure --profile architecture
AWS_PROFILE: (architecture)
AWS_REGION: (us-east-2)
ENV: (dev)
ROOT_DOMAIN: (bstoker.elevationcurb.com)

# set a named configuration for cenv to be the current default
$ cenv configure set architecture
default profile set to architecture
{
  "AWS_PROFILE": "architecture",
  "AWS_REGION": "us-east-2",
  "CDK_DEFAULT_REGION": "us-east-2",
  "ENV": "dev",
  "ROOT_DOMAIN": "bstoker.elevationcurb.com",
  "AWS_ACCESS_KEY_ID": "...",
  "AWS_SECRET_ACCESS_KEY": "...",
  "CDK_DEFAULT_ACCOUNT": "971995203899"
}

# set a second named configuration for cenv to be the current default
$ cenv configure --profile prod
AWS_PROFILE: (prod)
AWS_REGION: (us-east-1)
ENV: (prod)
ROOT_DOMAIN: (prod.elevationcurb.com)

# set a named configuration for cenv to be the current default
$ cenv configure set prod
default profile set to prod
{
  "AWS_PROFILE": "prod",
  "AWS_REGION": "us-east-1",
  "CDK_DEFAULT_REGION": "us-east-1",
  "ENV": "prod",
  "ROOT_DOMAIN": "prod.elevationcurb.com",
  "AWS_ACCESS_KEY_ID": "...",
  "AWS_SECRET_ACCESS_KEY": "...",
  "CDK_DEFAULT_ACCOUNT": "..."
}
```

## Integrating with a new service

sequence-configure_new_app.svg)


#### deploying a specific package with it's dependencies

Now that the @stoked-cenv/hello-world-node service has all of it's dependencies configured and assuming we've already set cenv in our local environment you can now run the following to install the service from scratch with all of it's dependencies:

```shell
$ cenv deploy -a @stoked-cenv/hello-world-node-deploy -b -d
```

The new -d (dependencies) flag tells the install function to install the docker and service dependencies before installing it's service.

### verify cenv components are installed to your currently configured profile and your region has been bootstrapped for Cdk

```shell
$ cenv deploy --verify
```


###Setup environment data files for your new-service
```bash
# from the root directory of packages/services/new-service
$ cenv init
@stoked-cenv/new-service:dev - saving local files
 - saving .cenv.dev.config
pushing dev variables to cloud
dev application configuration parameters are up to date
 - saving .cenv
 - saving .cenv.dev

### Integrate with node code
#### Add a dependency to cenv-lib in package.json

```json
{
  ...
  "dependencies": {
    "@stoked-cenv/lib": "^0.2.0-a.3",
  }
  ...
}
```

#### Run bootstrap
```bash
$ lerna bootstrap
```

#### Start cenv as the first line of code
```typescript
import { startCenv, ClientMode } from '@stoked-cenv/cenv';

(async () => {
  await startCenv(ClientMode.REMOTE_POLLING, '* * * * *');

  // put the rest of the start up code here
})();
```

### Add application configuration variables
```bash
# app variable
$ cenv add -a someAppVar someAppVal
 - writing parameter someappvar with value someAppVal
 - saving .cenv
 - saving .cenv.dev
# environment variable
$ cenv add -e someEnvVar someEnvVal
 - writing parameter someenvvar with value someEnvVal
 - saving .cenv
 - saving .cenv.dev
# global variable
$ cenv add -g someGlobalVar someGlobalVal
 - writing parameter someglobalvar with value someGlobalVal
 - creating link parameter /service/ec/new-service/global with value /global/someglobalvar
 - saving .cenv
 - saving .cenv.dev
 - saving .cenv.globals
```

### Deploy your params to be consumed by the service
```shell
cenv deploy
deploying @stoked-cenv/new-service configuration to environment dev
```

## Useful Commands

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
