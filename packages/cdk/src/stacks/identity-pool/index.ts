#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CognitoIdentityPoolStack } from "./cognito_identity_pool_stack";

const app = new cdk.App();

new CognitoIdentityPoolStack(app, `${process.env.ENV}-${process.env.APP}-cert`, {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
