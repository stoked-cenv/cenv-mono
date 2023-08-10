#!/usr/bin/env node
import 'source-map-support/register';
import { ECSServiceStack } from '../../index';
import { CenvFiles, EnvVars } from '@stoked-cenv/lib';

const envVars = new EnvVars(process.env, ['APPLICATION_NAME', 'HEALTH_CHECK_PATH'], [], true);
let subdomain = 'api';
if (process.env.CENV_SUBDOMAIN) {
  subdomain = process.env.CENV_SUBDOMAIN;
  process.env.ASSIGNED_DOMAIN = `${subdomain}.${CenvFiles.ENVIRONMENT}.${process.env.APP}.${process.env.ROOT_DOMAIN}`;
}

console.log('environment variables', JSON.stringify(envVars.allSafe, null, 2));

new ECSServiceStack({
                      env: CenvFiles.ENVIRONMENT,
                      subdomain,
                      stackName: process.env.CENV_STACK_NAME!,
                      ecrRepositoryName: process.env.CENV_DOCKER_NAME!,
                      healthCheck: {
                        path: envVars.check('HEALTH_CHECK_PATH') ? envVars.get('HEALTH_CHECK_PATH') : '/',
                      },
                      envVariables: envVars.all,
                    });
