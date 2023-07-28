#!/usr/bin/env node
import 'source-map-support/register.js';
import * as cdk from 'aws-cdk-lib';
import {LambdaApi} from './lambda-api';
import {validateEnvVars} from "@stoked-cenv/lib";


//const envVars = validateEnvVars(['ENV', 'CENV_STACK_NAME']);

const app = new cdk.App();
new LambdaApi(app, `${process.env.ENV}-${process.env.CENV_STACK_NAME}-lambda-api`, {});