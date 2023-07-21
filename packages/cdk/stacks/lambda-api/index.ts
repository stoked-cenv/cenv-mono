#!/usr/bin/env node
import 'source-map-support/register.js';
import * as cdk from 'aws-cdk-lib';
import {LambdaApi} from './lambda-api.js';
import {validateEnvVars} from "@stoked-cenv/lib";


const envVars = validateEnvVars(['ENV', 'CENV_STACK_NAME']);

const app = new cdk.App();
new LambdaApi(app, `${envVars.ENV}-${envVars.CENV_STACK_NAME}-lambda-api`, {});