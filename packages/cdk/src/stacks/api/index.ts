#!/usr/bin/env node
import 'source-map-support/register';
import { ECSServiceStack } from '../../index';
import { CenvFiles } from '@stoked-cenv/lib';

const envVars: Record<string, string> = {};
if (process.env.APPLICATION_NAME) {
  envVars['APPLICATION_NAME'] = process.env.APPLICATION_NAME;
}
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
                        path: process.env.HEALTH_CHECK_PATH ? process.env.HEALTH_CHECK_PATH : '/',
                      },
                      envVariables: envVars,
                    });
