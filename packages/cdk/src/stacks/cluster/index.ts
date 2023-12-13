#!/usr/bin/env node
import 'source-map-support/register';
import {CenvFiles} from '@stoked-cenv/lib';
import {existsSync, rmSync} from 'fs';
import path from 'path';
import {ClusterStack} from "../../ecs/cluster";

const context = path.join(__dirname, 'cdk.context.json');
if (existsSync(context)) {
  rmSync(path.join(__dirname, 'cdk.context.json'))
}

const {CENV_SUBDOMAIN, CENV_STACK_NAME} = process.env;

new ClusterStack({
  env: CenvFiles.ENVIRONMENT, subdomain: CENV_SUBDOMAIN || 'api', stackName: CENV_STACK_NAME!,
});
