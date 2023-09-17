import { App, Duration, Stack, StackProps } from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import { IVpc, Vpc } from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { getDefaultStackEnv, stackName, getVPCByName, stackPrefix, tagStack } from '../utils';
import { Construct } from 'constructs';

import {aws_autoscaling as autoscaling} from 'aws-cdk-lib';
import { aws_applicationautoscaling as app_autoscaling} from 'aws-cdk-lib';

export interface EcsQueueDeploymentParams {
  scope?: Construct;
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
  suffix?: string;
  cluster?: ecs.ICluster;
  clusterName?: string;
  taskDefinition?: ecs.FargateTaskDefinition,
  queue?: sqs.IQueue;
}

export class EcsQueueStack extends Stack {
  cluster: ecs.ICluster;
  queueProcessingFargateService: ecs_patterns.QueueProcessingFargateService;
  logGroup: logs.LogGroup;
  params: EcsQueueDeploymentParams;
  vpc: IVpc;

  constructor(params: EcsQueueDeploymentParams) {
    super(params?.scope ? params?.scope : new App(), params.id ?? `${params.env}-${params.stackName}${params.suffix ? '-' + params.suffix : ''}`, params.stackProps ?? getDefaultStackEnv());
    this.params = params;
    this.vpc = this.params.defaultVpc ? Vpc.fromLookup(this, 'VPC', { isDefault: true }) : getVPCByName(this);

    // A regional grouping of one or more container instances on which you can run tasks and services.
    // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs.Cluster.html
    if (!params.cluster && !params.clusterName) {
      this.cluster = new ecs.Cluster(this, stackName('cluster'), {
        vpc: this.vpc, clusterName: stackName('cluster'),
      });
    } else if (params.clusterName) {
      const cluster = ecs.Cluster.fromClusterAttributes(this, 'Cluster', {
        clusterName: params.clusterName,
        vpc: Vpc.fromLookup(this, 'VPC', { isDefault: params.defaultVpc }),
        securityGroups: []
      });
      this.cluster = params.cluster;
    }


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


    // creates a fifo queue
    const queue = new sqs.Queue(this, stackName('queue'), {
      queueName: stackName('fifo-queue.fifo'),
      contentBasedDeduplication: true,
      fifo: true,
      receiveMessageWaitTime: Duration.seconds(20),
      retentionPeriod: Duration.seconds(345600),
      visibilityTimeout: Duration.seconds(43200)
    })

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
        queue: params?.queue ? params.queue : queue,
        cpu: 256, // Default is 256 // 0.25 CPU
        image,
        memoryLimitMiB: 512, // Default is 512
        minScalingCapacity: 0, // min number of tasks
        maxScalingCapacity: 1, // the max number of tasks a service can spin up
        scalingSteps: [
          {"upper": 0, "change": 0},
          {"lower": 1, "change": +1},
        ], // this defines how the service shall autoscale
        environment: params.envVariables,
        taskDefinition: params.taskDefinition,

      });


    // attach inline policy for interacting with AppConfig
    if (params.actions) {
      this.queueProcessingFargateService.taskDefinition.taskRole?.attachInlinePolicy(new iam.Policy(this, `${stackPrefix()}-config`, {
        statements: [new iam.PolicyStatement({
          actions: params.actions, resources: ['*'],
        })],
      }));
    }
/*
    // initialise the fargate service CPU usage metric to average over 3 minutes
    const fargateServiceCpuMetric =  this.queueProcessingFargateService.service.metricCpuUtilization({
      period: Duration.minutes(3),
      statistic: "avg"
    });

    // add an alarm to our fargate service CPU usage
    const scaleInInit = fargateServiceCpuMetric.createAlarm(this, 's3-tools-thumbnailer-ScaleInInit', {
      alarmDescription: "For when sample app is idle, scale service to 0",
      alarmName: 'queueIdleAlarm',
      evaluationPeriods: 1,
      threshold: 0.01, // set threshold of cpu usage.
      actionsEnabled: true,
      //# create comparison operator so that we compare our cpu usage with our threshold. We want it less than or equal to the threshold             comparison_operator=cw.ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,

      datapointsToAlarm: 1
    });

    // define our auto scaling target for our fargate service
    const scalableTarget = app_autoscaling.ScalableTarget.fromScalableTargetId(
      this,
      's3-tools-thumbnailer-scalable-target',
      `service/${this.queueProcessingFargateService.cluster.clusterName}/${this.queueProcessingFargateService.service.serviceName}|ecs:service:DesiredCount|ecs`,
    );

    // define the action taken on our scaling target
    const scalingAction = new app_autoscaling.StepScalingAction(
      this,
      's3-tools-thumbnailer-scaleToZero', {
        scalingTarget: scalableTarget,
        adjustmentType: autoscaling.AdjustmentType.EXACT_CAPACITY,
      });
   */
    tagStack(this);
  }

  getTaskImageOptions(): Partial<ecs_patterns.ApplicationLoadBalancedTaskImageOptions> {
    return {};
  }
}
