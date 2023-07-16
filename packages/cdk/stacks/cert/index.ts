#!/usr/bin/env node
import 'source-map-support/register.js';
import * as cdk from 'aws-cdk-lib';
import { SiteCertificateStack } from './site-certificate-stack.js';

const app = new cdk.App();

const {
  ENV,
  APP
} = process.env;

const environment = ENV;

new SiteCertificateStack(app, `${ENV}-cert-${APP}`, {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION }
});