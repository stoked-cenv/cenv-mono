#!/usr/bin/env node
import 'source-map-support/register.js';
import { ECSServiceStack } from '../../core/index.js'
import {validateEnvVars} from "@stoked-cenv/lib";

const vars = validateEnvVars(['ENV', 'ROOT_DOMAIN', 'CENV_STACK_NAME', 'CENV_DOCKER_NAME']);
const envVariables: Record<string, string> = {
  ISSUER_BASE_URL: process.env.ISSUER_BASE_URL,
  PORT: process.env.PORT,
  AUDIENCE: process.env.AUDIENCE,
  CLIENT_ORIGIN_URL: process.env.CLIENT_ORIGIN_URL,
  API_VERSION: process.env.API_VERSION,
  APPLICATION_NAME: process.env.APPLICATION_NAME,
}

let subdomain = 'api';
if (process.env.CENV_SUBDOMAIN) {
  subdomain = process.env.CENV_SUBDOMAIN;
  process.env.ASSIGNED_DOMAIN = `${subdomain}.${vars.ENV}.${vars.ROOT_DOMAIN}`;
}

new ECSServiceStack(
  {
    env: vars.ENV,
    subdomain,
    stackName: vars.CENV_STACK_NAME,
    ecrRepositoryName: vars.CENV_DOCKER_NAME,
    healthCheck: {
      path: process.env.HEALTH_CHECK_PATH ? process.env.HEALTH_CHECK_PATH : '/',
    },
    envVariables
  }
);
