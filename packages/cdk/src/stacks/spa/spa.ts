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
import {tagStack} from '../../index';
import { CenvFiles, validateEnvVars } from '@stoked-cenv/lib';

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

    const domainName = process.env.ROOT_DOMAIN;
    const www = process.env.APP_DOMAIN;

    console.log("env: " + CenvFiles.ENVIRONMENT);
    console.log("www: " + www!);

    const zone = HostedZone.fromLookup(this, "zone", {
      domainName: process.env.ROOT_DOMAIN!
    });


    const certImport = Fn.importValue(`${CenvFiles.ENVIRONMENT}-site-cert`);
    const certificate = Certificate.fromCertificateArn(this, `${CenvFiles.ENVIRONMENT}-site-cert`, certImport);

    const cloudfrontOAI = new OriginAccessIdentity(this, `${CenvFiles.ENVIRONMENT}-${process.env.CENV_STACK_NAME}-cf-OAI`, {
      comment: `OAI for ${www}`,
    });

    new CfnOutput(this, 'Site', {value: `https://${www}`});

    // s3
    const bucket = new Bucket(this, `${CenvFiles.ENVIRONMENT}-${process.env.CENV_STACK_NAME}`, {
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
    new CfnOutput(this, `${CenvFiles.ENVIRONMENT}-${process.env.CENV_STACK_NAME}-Bucket`, {value: bucket.bucketName});

    // Specifies you want viewers to use HTTPS & TLS v1.1 to request your objects
    const viewerCertificate = ViewerCertificate.fromAcmCertificate({
                                                                     certificateArn: certificate.certificateArn, env: {
        region: process.env.CDK_DEFAULT_REGION!, account: process.env.CDK_DEFAULT_ACCOUNT!,
      }, applyRemovalPolicy(): void {
      }, node: this.node, stack: this, metricDaysToExpiry: () => new Metric({
                                                                              namespace: 'TLS Viewer Certificate Validity',
                                                                              metricName: 'TLS Viewer Certificate Expired',
                                                                            }),
                                                                   }, {
                                                                     sslMethod: SSLMethod.SNI,
                                                                     securityPolicy: SecurityPolicyProtocol.TLS_V1_1_2016,
                                                                     aliases: CenvFiles.ENVIRONMENT === 'prod' ? [`${process.env.APP}.${domainName}`, www!] : [www!],
                                                                   },);

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
      new ARecord(this, `${CenvFiles.ENVIRONMENT}-${process.env.CENV_STACK_NAME}-enduser-a`, {
        recordName: `${process.env.APP}.${domainName}`, target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)), zone,
      });
    }
    new ARecord(this, `${CenvFiles.ENVIRONMENT}-${process.env.CENV_STACK_NAME}-app-a`, {
      recordName: www, target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)), zone,
    });

    // Deployment the bucket
    new BucketDeployment(this, `${CenvFiles.ENVIRONMENT}-${process.env.CENV_STACK_NAME}-cra`, {
      sources: [Source.asset(process.env.CENV_BUILD_PATH as string)],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ['/*'],
      memoryLimit: 512
    });

    tagStack(this as Stack);
  }
}
