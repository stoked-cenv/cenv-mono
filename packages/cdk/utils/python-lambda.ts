import {Duration, Stack, StackProps} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import * as lambda from "aws-cdk-lib/aws-lambda"
import * as logs from 'aws-cdk-lib/aws-logs';
import { LambdaProps } from './lambda-props'
import { tagStack } from './utils';

const {ENV} = process.env;

export class PythonLambda extends Stack {
  protected lambda_handler: lambda.IFunction;
  constructor(scope: Construct, id: string, props?: LambdaProps) {
    super(scope, id, props as StackProps);

    const functionName = `${id}-fn`;

    this.lambda_handler = new PythonFunction(this, functionName!, {
      functionName: functionName,
      description: functionName,// probably needed to allow other Lambda to invoke this Lambda by a mutually known name
      entry: '../src', // required
      runtime: lambda.Runtime.PYTHON_3_9, // required
      index: 'lambda_function.py', // optional, defaults to 'index.py'
      handler: 'lambda_handler', // optional, defaults to 'handler'
      environment: props?.envVars,
      timeout: props?.timeout || Duration.seconds(30),
      logRetention: logs.RetentionDays.THREE_DAYS // this should be set to avoid unlimited disk space usage in docker containers and such.
    })

    tagStack(this);
  }
}
