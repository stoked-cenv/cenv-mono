#!/usr/bin/env node
import 'source-map-support/register';
import { CenvFiles, EnvVars } from '@stoked-cenv/lib';
import { existsSync, rmSync } from 'fs';
import path from 'path';
import { EcsQueueStack } from '../../ecs/service-queue';

const context = path.join(__dirname, 'cdk.context.json');
if (existsSync(context)) {
  rmSync(path.join(__dirname, 'cdk.context.json'))
}

const envVars = new EnvVars(process.env, ['APPLICATION_NAME'], [], true);
const { APP, CENV_DOCKER_NAME } = process.env;
console.log('APP, CENV_DOCKER_NAME', APP, CENV_DOCKER_NAME)
console.log('environment variables', JSON.stringify(envVars.allSafe, null, 2));

new EcsQueueStack({
  env: CenvFiles.ENVIRONMENT,
  stackName: process.env.CENV_STACK_NAME!,
  ecrRepositoryName: process.env.CENV_DOCKER_NAME!,
  envVariables: envVars.all,
  defaultVpc: false
});
