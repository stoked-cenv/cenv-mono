import {CfnOutput, Fn, RemovalPolicy, Stack, StackProps} from 'aws-cdk-lib';
import {Certificate} from 'aws-cdk-lib/aws-certificatemanager';
import {
  CloudFrontAllowedMethods,
  CloudFrontWebDistribution,
  OriginAccessIdentity,
  SecurityPolicyProtocol,
  SSLMethod,
  ViewerCertificate,
} from 'aws-cdk-lib/aws-cloudfront';
import {Metric} from 'aws-cdk-lib/aws-cloudwatch';
import {CanonicalUserPrincipal, PolicyStatement} from 'aws-cdk-lib/aws-iam';
import {ARecord, HostedZone, RecordTarget} from 'aws-cdk-lib/aws-route53';
import {CloudFrontTarget} from 'aws-cdk-lib/aws-route53-targets';
import {BlockPublicAccess, Bucket} from 'aws-cdk-lib/aws-s3';
import {BucketDeployment, Source} from 'aws-cdk-lib/aws-s3-deployment';
import {Construct} from 'constructs';
import * as process from 'process';
import { getDomains, stackPrefix, tagStack } from '../../index';
import { CenvFiles } from '@stoked-cenv/lib';

export class SpaStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    /*const envVars = validateEnvVars([
      'APP',
      'APP_DOMAIN',
      'CDK_DEFAULT_REGION',
      'ENV',
      'CDK_DEFAULT_ACCOUNT',
      'ROOT_DOMAIN',
      'CENV_STACK_NAME',
      'CENV_BUILD_PATH',
      'CENV_BUCKET_NAME'
    ]);*/

    const domains = getDomains();
    console.log('bucket source location (CENV_BUILD_PATH):', process.env.CENV_BUILD_PATH);

    const zone = HostedZone.fromLookup(this, "zone", {
      domainName: domains.root
    });

    const prefix = stackPrefix();
    const certImport = Fn.importValue(`${prefix}-cert`);
    const certificate = Certificate.fromCertificateArn(this, `${prefix}-site-cert`, certImport);

    const cloudfrontOAI = new OriginAccessIdentity(this, `${prefix}-cf-OAI`, {
      comment: `OAI for ${domains.primary}`,
    });

    new CfnOutput(this, 'Site', {value: `https://${domains.primary}`});

    // s3
    const bucket = new Bucket(this, `${prefix}`, {
      bucketName: `${process.env.CENV_BUCKET_NAME}`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

    // Grant access to cloudfront
    bucket.addToResourcePolicy(new PolicyStatement({
                                                     actions: ['s3:GetObject'],
                                                     resources: [bucket.arnForObjects('*')],
                                                     principals: [new CanonicalUserPrincipal(cloudfrontOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId,),],
                                                   }),);
    new CfnOutput(this, `${prefix}-Bucket`, {value: bucket.bucketName});

    const cert = {
      certificateArn: certificate.certificateArn,
      env: {
        region: process.env.CDK_DEFAULT_REGION!,
        account: process.env.CDK_DEFAULT_ACCOUNT!,
      },
      applyRemovalPolicy(): void {},
      node: this.node,
      stack: this,
      metricDaysToExpiry: () => new Metric({
        namespace: 'TLS Viewer Certificate Validity',
        metricName: 'TLS Viewer Certificate Expired',
      }),
    };
    // Specifies you want viewers to use HTTPS & TLS v1.1 to request your objects
    const viewerCertificate = ViewerCertificate.fromAcmCertificate(cert, {
                                                                     sslMethod: SSLMethod.SNI,
                                                                     securityPolicy: SecurityPolicyProtocol.TLS_V1_1_2016,
                                                                     aliases: CenvFiles.ENVIRONMENT === 'prod' ? [domains.primary, domains.env, domains.www!] : [domains.primary],
                                                                   });

    // CloudFront distribution
    const distribution = new CloudFrontWebDistribution(this, 'LocDashboardSiteDistribution', {
      viewerCertificate, originConfigs: [{
        s3OriginSource: {
          s3BucketSource: bucket, originAccessIdentity: cloudfrontOAI,
        }, behaviors: [{
          isDefaultBehavior: true, compress: true, allowedMethods: CloudFrontAllowedMethods.GET_HEAD_OPTIONS,
        },],
      },], errorConfigurations: [{
        errorCode: 403, responseCode: 200, responsePagePath: '/index.html',
      },],
    },);
    new CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId,
    });

    if (CenvFiles.ENVIRONMENT === 'prod') {
      // Route53 alias record for the CloudFront distribution
      new ARecord(this, `${prefix}-env-a`, {
        recordName: domains.env, target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)), zone,
      });

      new ARecord(this, `${prefix}-www-a`, {
        recordName: domains.www, target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)), zone,
      });
    }

    new ARecord(this, `${prefix}-primary-a`, {
      recordName: domains.primary, target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)), zone,
    });

    // Deployment the bucket
    new BucketDeployment(this, `${prefix}-cra`, {
      sources: [Source.asset(process.env.CENV_BUILD_PATH as string)],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ['/*'],
      memoryLimit: 512
    });

    tagStack(this as Stack);
  }
}

/*
{                                                                                                                                                                                                  │
│   strictVersions: false,                                                                                                                                                                           │
│   mode: 'DEPLOY',                                                                                                                                                                                  │
│   force: true,                                                                                                                                                                                     │
│   args: {                                                                                                                                                                                          │
│     CENV_PROFILE: 'stoked-dev',                                                                                                                                                                    │
│     ENV: 'dev',                                                                                                                                                                                    │
│     ROOT_DOMAIN: 'stokedconsulting.com',                                                                                                                                                           │
│     AWS_PROFILE: 'truapi',                                                                                                                                                                         │
│     AWS_REGION: 'us-east-1',                                                                                                                                                                       │
│     CDK_DEFAULT_ACCOUNT: '883859713095',                                                                                                                                                           │
│     AWS_ACCOUNT_USER: 'AIDAIONZQJH6TSX5JJ7US',                                                                                                                                                     │
│     AWS_ACCOUNT_USER_ARN: 'arn:aws:iam::883859713095:user/bstoker',                                                                                                                                │
│     AWS_ACCESS_KEY_ID: 'AKIAI3TMZ4W7F4JYRAIA',                                                                                                                                                     │
│     AWS_SECRET_ACCESS_KEY: 'SeFNoD9m9DBr7AR2U61m6RSiYE5gSXKK720f0Y+W',                                                                                                                             │
│     CDK_DEFAULT_REGION: 'us-east-1',                                                                                                                                                               │
│     CENV_NETWORK_CIDR: '10.140.0.0/24',                                                                                                                                                            │
│     CI: 'true'                                                                                                                                                                                     │
│   },                                                                                                                                                                                               │
│   suite: 'bs-spa',                                                                                                                                                                                 │
│   cli: false,                                                                                                                                                                                      │
│   dependencies: true,                                                                                                                                                                              │
│   userInterface: true,                                                                                                                                                                             │
│   exec: true,                                                                                                                                                                                      │
│   lib: true,                                                                                                                                                                                       │
│   docker: true,                                                                                                                                                                                    │
│   parameters: true,                                                                                                                                                                                │
│   stack: true,                                                                                                                                                                                     │
│   build: true,                                                                                                                                                                                     │
│   skipBuild: undefined,                                                                                                                                                                            │
│   dashboardOptions: undefined,                                                                                                                                                                     │
│   pkgPath: '/Users/stoked/work/internal/packages/cenv-mono/packages/cdk/src/stacks/spa',                                                                                                           │
│   cenvVars: {                                                                                                                                                                                      │
│     CENV_BUILD_PATH: '/Users/stoked/work/internal/packages/cenv-mono/packages/cdk/stacks',                                                                                                         │
│     CENV_BUCKET_NAME: 'dev-brianstoker-spa-9713095',                                                                                                                                               │
│     APP: 'brianstoker',                                                                                                                                                                            │
│     CENV_PKG_VERSION: '2.0.0-a.76',                                                                                                                                                                │
│     CENV_STACK_NAME: 'brianstoker-spa'                                                                                                                                                             │
│   },                                                                                                                                                                                               │
│   redirectStdErrToStdOut: true                                                                                                                                                                     │
│ }
*/