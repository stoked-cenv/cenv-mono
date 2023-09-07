import { App, Duration, Fn, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import { IVpc, Vpc } from 'aws-cdk-lib/aws-ec2';
import { HealthCheck } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { HostedZone, IHostedZone } from 'aws-cdk-lib/aws-route53';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { ensureValidCerts, getDefaultStackEnv, getDomains, getVPCByName, stackPrefix, tagStack } from './utils';
import { CenvFiles } from '@stoked-cenv/lib';
import { VPC } from 'aws-sdk/clients/sms';

export interface ECSJobDeploymentParams {
  env: string;
  id?: string;
  envVariables?: Record<string, string>;
  taskImageOptions?: Partial<ecs_patterns.ApplicationLoadBalancedTaskImageOptions>;
  stackProps?: StackProps;
  stackName: string;
  defaultVpc: boolean;
  ecrRepositoryName: string;
  logRetention?: logs.RetentionDays;
  region?: string;
  actions?: string[];
}


export class ECSJobStack extends Stack {
  cluster: ecs.Cluster;
  queueProcessingFargateService: ecs_patterns.QueueProcessingFargateService;
  scalableTarget: ecs.ScalableTaskCount;
  logGroup: logs.LogGroup;
  params: ECSJobDeploymentParams;
  vpc: IVpc;

  constructor(params: ECSJobDeploymentParams) {
    super(new App(), params.id ?? `${params.env}-${params.stackName}`, params.stackProps ?? getDefaultStackEnv());
    this.params = params;
    this.vpc = this.params.defaultVpc ? Vpc.fromLookup(this, 'VPC', { isDefault: true }) : getVPCByName(this);

    // A regional grouping of one or more container instances on which you can run tasks and services.
    // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs.Cluster.html
    this.cluster = new ecs.Cluster(
      this,
      `${stackPrefix()}-cluster`,
      {
        vpc: this.vpc,
        clusterName: `${stackPrefix()}-cluster`,
      });


    this.logGroup = new logs.LogGroup(this, `lg`, {
      retention: logs.RetentionDays.ONE_WEEK,
    });

    const logging = new ecs.AwsLogDriver({
      streamPrefix: `${stackPrefix()}-fargate`,
      logGroup: this.logGroup,
    });

    const repository = ecr.Repository.fromRepositoryName(
      this,
      this.params.ecrRepositoryName.replace('/', '-'),
      this.params.ecrRepositoryName);
    const shortDigest = process.env.CENV_PKG_DIGEST ? process.env.CENV_PKG_DIGEST!.substring(process.env.CENV_PKG_DIGEST!.length - 8) : '';
    const containerName = `${stackPrefix()}-${process.env.CENV_PKG_VERSION}-${shortDigest}`.replace(/\./g, '-');

    const image = ecs.ContainerImage.fromEcrRepository(repository, 'latest');
    // Create a load-balanced Fargate service and make it public
    // A Fargate service running on an ECS cluster fronted by an application load balancer.
    // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs_patterns.ApplicationLoadBalancedFargateService.html
    this.queueProcessingFargateService = new ecs_patterns.QueueProcessingFargateService(
      this,
      `${stackPrefix()}-fg`,
      {
        cluster: this.cluster, // Required
        assignPublicIp: true,
        serviceName: `${stackPrefix()}-svc`,
        cpu: 256, // Default is 256 // 0.25 CPU
        image,
        memoryLimitMiB: 512 // Default is 512
      });

    // attach inline policy for interacting with AppConfig
    this.queueProcessingFargateService.taskDefinition.taskRole?.attachInlinePolicy(new iam.Policy(this, `${stackPrefix()}-config`, {
      statements: [new iam.PolicyStatement({
        actions: params.actions,
        resources: ['*'],
      })],
    }));

    tagStack(this);

    // An attribute representing the minimum and maximum task count for an AutoScalingGroup.
    this.scalableTarget = this.queueProcessingFargateService.service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 5,
    });

    // Scales in or out to achieve a target CPU utilization.
    this.scalableTarget.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 50,
    });

    // Scales in or out to achieve a target memory utilization.
    this.scalableTarget.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: 50,
    });

    new cloudwatch.Metric({
      metricName: 'CPUUtilization',
      namespace: 'ECS/ContainerInsights',
      dimensionsMap: {
        ServiceName: this.queueProcessingFargateService.service.serviceName,
        ClusterName: this.cluster.clusterName,
      },
      statistic: 'avg',
      period: Duration.minutes(5),
    });

    new cloudwatch.Metric({
      metricName: 'MemoryUtilization',
      namespace: 'ECS/ContainerInsights',
      dimensionsMap: {
        ServiceName: this.queueProcessingFargateService.service.serviceName,
        ClusterName: this.cluster.clusterName,
      }, statistic: 'avg',
      period: Duration.minutes(5),
    });
  }

  getTaskImageOptions(): Partial<ecs_patterns.ApplicationLoadBalancedTaskImageOptions> {
    return {};
  }
}