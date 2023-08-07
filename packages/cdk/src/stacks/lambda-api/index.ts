#!/usr/bin/env node
import 'source-map-support/register.js';
import * as cdk from 'aws-cdk-lib';
import { LambdaApi } from './lambda-api';
import { CenvFiles } from '@stoked-cenv/lib';

const app = new cdk.App();
new LambdaApi(app, `${CenvFiles.ENVIRONMENT}-${process.env.CENV_STACK_NAME}-lambda-api`, {});