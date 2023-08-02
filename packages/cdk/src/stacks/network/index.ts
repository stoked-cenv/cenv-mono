#!/usr/bin/env node
import 'source-map-support/register.js';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from './network';

const app = new cdk.App();

const {
  ENV,
} = process.env;

// const environment = ENV === "prod" ? "prod" : "stage";
const environment = ENV;

new NetworkStack(app, `${ENV}-network`, {});
