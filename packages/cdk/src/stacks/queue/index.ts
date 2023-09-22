#!/usr/bin/env node
import 'source-map-support/register';
import { EnvVars } from '@stoked-cenv/lib';
import { existsSync, rmSync } from 'fs';
import path from 'path';
import { EcsQueueStack } from '../../ecs/service-queue';

const context = path.join(__dirname, 'cdk.context.json');
if (existsSync(context)) {
  rmSync(path.join(__dirname, 'cdk.context.json'))
}

const envVars= new EnvVars(process.env, ['APPLICATION_NAME', 'CENV_STACK_PROPS', 'CENV_STACK_PROPS_ENV_VARS'], [], true);
const propsEnvVars = JSON.parse(envVars.all['CENV_STACK_PROPS_ENV_VARS']);
const props = JSON.parse(envVars.all['CENV_STACK_PROPS']);

console.log('props', JSON.stringify(props, null, 2));
console.log('propsEnvVars', JSON.stringify(propsEnvVars, null, 2));

new EcsQueueStack({
  env: process.env.ENV,
  ...props,
  envVariables: propsEnvVars
});

/*
new EcsQueueStack({
  scope: this,
  env: process.env.ENV,
  stackName: stackName('thumbnailer-mgr'),
  ecrRepositoryName: 'stokedconsulting/s3-tools-thumbnailer-mgr',
  defaultVpc: true,
  clusterName: 's3-tools-cluster',
  envVariables: {
    ...envVars
  },
  taskDefinitionName: 'thumbnailerMgrTask',
  queueProps: {
    queueName: 'thumbnailer-queue',
    receiveMessageWaitTime: Duration.seconds(0),
    retentionPeriod: Duration.seconds(345600),
    visibilityTimeout: Duration.seconds(43200)
  },
  actions: [
    's3:*',
    'appconfig:*',
    'sqs:*'
  ]
});
*/