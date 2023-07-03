# Cenv PARAMS

The Cenv `PARAMS` module was designed around the principal that there are fundamentally four types of application configuration variables. For the purposes of cenv we have codified them as (a)pplication, (e)nvironment, and (g)lobal, and (ge) global environment variables.

### Application Variables

Application variables are variables that are application specific and will remain the same across all instances of the application. An example of an application variable would be a service has a local directory that it needs to access that could potentially change or be modified in the future like an upload directory:

```bash
$ UPLOAD_DIRECTORY="../uploads"
```

### Environment Variables

Environment variables are variables that only this service will access however they will be different on each environment. An example of an environment variable the number of tasks to run for a particular service in ecs.

### Global Variables

Global variables are variables that are shared across multiple services. An example of a global variable would be an api key for GOOGLE MAPS:

```bash
$ GOOGLE_MAPS_API_KEY="ce5aacd0-69a6-11ed-ae11-06603a4ac86e"
```

### Global Environment Variables

Global environment variables are different between each environment but consistent across all services.

```bash
# local
$ BASE_URL="http://localhost:9193/api"

# dev
$ BASE_URL="https://dev.serviceA.elevationcurb.com/api"

# qa
$ BASE_URL="https://qa.serviceA.elevationcurb.com/api"

# prod
$ BASE_URL="https://serviceA.elevationcurb.com/api"
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
    "@stoked-cenv/lib": "^2.0.0-a.5,
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
