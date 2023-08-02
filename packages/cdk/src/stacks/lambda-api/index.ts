#!/usr/bin/env node
import 'source-map-support/register.js';
import * as cdk from 'aws-cdk-lib';
import { LambdaApi } from './lambda-api';

const app = new cdk.App();
new LambdaApi(app, `${process.env.ENV}-${process.env.CENV_STACK_NAME}-lambda-api`, {});