import { StackProps, Duration } from 'aws-cdk-lib';

export interface LambdaProps extends StackProps {
  envVars?: { [key: string]: string },
  timeout?: Duration
}
