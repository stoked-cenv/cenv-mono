import * as aws_iam from 'aws-cdk-lib/aws-iam';

export const iam = aws_iam;
export * from 'aws-cdk-lib';
export * from './ecs';
export * from './python-lambda';
export * from './lambda-props';
export * from './utils';
export * from 'constructs';