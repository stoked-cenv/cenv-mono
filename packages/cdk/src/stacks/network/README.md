# Hello world Network Project

## For Deploying Network Project from local system, use the following commands

```shell
export CDK_DEFAULT_ACCOUNT=<your AWS Account Id>
export CDK_DEFAULT_REGION=<your AWS Deployment Region>
export AWS_ACCESS_KEY_ID=<your access key id>
export AWS_SECRET_ACCESS_KEY=<your secret access key>
export ROOT_DOMAIN=<your root domain>
export ENV=<your environment>
cdk synth
cdk deploy

```

If you are deploying first time, then please run the following commands

```shell
cdk bootstrap
```


## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template


