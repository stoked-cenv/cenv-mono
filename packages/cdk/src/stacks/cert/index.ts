#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SiteCertificateStack } from './site-certificate-stack';

const app = new cdk.App();

new SiteCertificateStack(app, `${process.env.ENV}-${process.env.APP}-cert`, {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
