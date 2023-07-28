#!/usr/bin/env node
import 'source-map-support/register.js';
import * as cdk from 'aws-cdk-lib';
import {SpaStack} from './spa';

const {CDK_DEFAULT_REGION, ENV, CDK_DEFAULT_ACCOUNT, CENV_STACK_NAME} = process.env;

const app = new cdk.App();
new SpaStack(app, `${ENV}-${CENV_STACK_NAME}`, {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */

  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  env: {account: CDK_DEFAULT_ACCOUNT, region: CDK_DEFAULT_REGION},

  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  // env: { account: '123456789012', region: 'us-east-1' },

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});
