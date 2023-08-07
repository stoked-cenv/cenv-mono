#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from './network';
import { CenvFiles } from '@stoked-cenv/lib';

const app = new cdk.App();

new NetworkStack(app, `${CenvFiles.ENVIRONMENT}-network`, {});
