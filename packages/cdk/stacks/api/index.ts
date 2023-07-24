#!/usr/bin/env node
import 'source-map-support/register.js';
import {ECSServiceStack} from '../../core/index.js'
import {validateEnvVars} from "@stoked-cenv/lib";

//const envVars = validateEnvVars(['ENV', 'ROOT_DOMAIN', 'CENV_STACK_NAME', 'CENV_DOCKER_NAME', 'ISSUER_BASE_URL', 'PORT', 'AUDIENCE', 'CLIENT_ORIGIN_URL', 'API_VERSION'])
const envVars: Record<string, string> = {}
if (process.env.APPLICATION_NAME) {
  envVars['APPLICATION_NAME'] = process.env.APPLICATION_NAME;
}
let subdomain = 'api';
if (process.env.CENV_SUBDOMAIN) {
  subdomain = process.env.CENV_SUBDOMAIN;
  process.env.ASSIGNED_DOMAIN = `${subdomain}.${process.env.ENV}.${process.env.ROOT_DOMAIN}`;
}

new ECSServiceStack({
                      env: process.env.ENV!,
                      subdomain,
                      stackName: process.env.CENV_STACK_NAME!,
                      ecrRepositoryName: process.env.CENV_DOCKER_NAME!,
                      healthCheck: {
                        path: process.env.HEALTH_CHECK_PATH ? process.env.HEALTH_CHECK_PATH : '/',
                      },
                      envVariables: envVars
                    });
