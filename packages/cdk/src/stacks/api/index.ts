#!/usr/bin/env node
import 'source-map-support/register';
import { ECSServiceStack } from '../../index';
import { CenvFiles, EnvVars } from '@stoked-cenv/lib';

const envVars = new EnvVars({}, ['APPLICATION_NAME', 'HEALTH_CHECK_PATH'])
let subdomain = 'api';
if (process.env.CENV_SUBDOMAIN) {
  subdomain = process.env.CENV_SUBDOMAIN;
  process.env.ASSIGNED_DOMAIN = `${subdomain}.${CenvFiles.ENVIRONMENT}.${process.env.APP}.${process.env.ROOT_DOMAIN}`;
}

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
