#!/usr/bin/env node
import 'source-map-support/register';
import { EcsHttpStack } from '../../ecs/service-http';
import { CenvFiles, EnvVars } from '@stoked-cenv/lib';
import { existsSync, rmSync } from 'fs';
import path from 'path';

const context = path.join(__dirname, 'cdk.context.json');
if (existsSync(context)) {
  rmSync(path.join(__dirname, 'cdk.context.json'))
}

const envVars = new EnvVars(process.env, ['APPLICATION_NAME', 'HEALTH_CHECK_PATH'], [], true);
const { ROOT_DOMAIN, APP, CENV_SUBDOMAIN, ASSIGNED_DOMAIN, DOMAIN, CENV_DOCKER_NAME, CENV_STACK_NAME } = process.env;
console.log('ROOT_DOMAIN, APP, CENV_SUBDOMAIN, ASSIGNED_DOMAIN, DOMAIN, CENV_DOCKER_NAME', ROOT_DOMAIN, APP, CENV_SUBDOMAIN, ASSIGNED_DOMAIN, DOMAIN, CENV_DOCKER_NAME)
console.log('environment variables', JSON.stringify(envVars.allSafe, null, 2));

const subdomain = 'api' || CENV_SUBDOMAIN;
const stackName = process.env.CENV_STACK_NAME!;
new EcsHttpStack({
  env: CenvFiles.ENVIRONMENT,
  subdomain: 'api' || CENV_SUBDOMAIN,
  stackName: CENV_STACK_NAME!,
  ecrRepositoryName: CENV_DOCKER_NAME!,
  healthCheck: {
    path: envVars.check('HEALTH_CHECK_PATH') ? envVars.get('HEALTH_CHECK_PATH') : '/',
  },
  envVariables: envVars.all,
});
