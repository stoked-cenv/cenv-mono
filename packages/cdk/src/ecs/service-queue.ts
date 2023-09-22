import {App, Duration, Stack, StackProps} from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import {ContainerImage} from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import {IVpc} from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import {Repository} from 'aws-cdk-lib/aws-ecr';
import {stackName, stackPrefix, tagStack} from '../utils';
import {Construct} from 'constructs';

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
  inlinePolicies?: { actions: string[], resources: string[] }[];
  suffix?: string;
  cluster?: ecs.ICluster;
  clusterName?: string;
  taskDefinition?: ecs.FargateTaskDefinition,
  queue?: sqs.IQueue;
  queueProps?: sqs.QueueProps;
  queueName?: string;
  fifo?: boolean;
  taskDefinitionFamily?: string;
}

export class EcsQueueStack extends Stack {
  cluster: ecs.ICluster;
  queueProcessingFargateService: ecs_patterns.QueueProcessingFargateService;
  logGroup: logs.LogGroup;
  params: EcsQueueDeploymentParams;
  vpc: IVpc;

  constructor(params: EcsQueueDeploymentParams) {
    super(new App(), `${params.env}-${params.stackName}`, params.stackProps);
    this.params = params;
    const source = s3.Bucket.fromBucketName(this, 'source-bucket', params.envVariables.SOURCE_BUCKET);
    const destination = s3.Bucket.fromBucketName(this, 'dest-bucket', params.envVariables.DESTINATION_BUCKET);

    const getQueue = () => {
      if (params.queue) {
        return params.queue;
      } else if (params.queueProps) {
        return new sqs.Queue(this, stackName('queue'), params.queueProps)
      } else if (params.queueName) {
        let queueProps: sqs.QueueProps = {
          queueName: params.queueName,
          receiveMessageWaitTime: Duration.seconds(20),
          retentionPeriod: Duration.seconds(345600),
          visibilityTimeout: Duration.seconds(43200),
          fifo: params.fifo ? true : undefined,
          contentBasedDeduplication: params.fifo ? true : undefined,
        }
        return new sqs.Queue(this, stackName('queue'), queueProps);
      }
      return new sqs.Queue(this, stackName('queue'), {
        queueName: stackName('fifo-queue.fifo'),
        fifo: params.fifo ? true : undefined,
        contentBasedDeduplication: params.fifo ? true : undefined,
        receiveMessageWaitTime: Duration.seconds(20),
        retentionPeriod: Duration.seconds(345600),
        visibilityTimeout: Duration.seconds(43200)
      })
    }

    // creates a fifo queue
    const queue = getQueue();

    this.logGroup = new logs.LogGroup(this, `lg`, {
      retention: logs.RetentionDays.ONE_WEEK,
    });

    const logDriver = new ecs.AwsLogDriver({
      streamPrefix: `${stackPrefix()}-fargate`, logGroup: this.logGroup,
    });

    const image = ContainerImage.fromEcrRepository( Repository.fromRepositoryName(this, params.ecrRepositoryName, params.ecrRepositoryName), 'latest');

    this.queueProcessingFargateService = new ecs_patterns.QueueProcessingFargateService(this, params.stackName, {
      cluster: this.cluster, // Required
      assignPublicIp: true,
      serviceName: params.stackName + '-svc' ?? `${stackPrefix()}-svc`,
      queue,
      cpu: 256, // Default is 256 // 0.25 CPU
      memoryLimitMiB: 512, // Default is 512
      minScalingCapacity: 0, // min number of tasks
      maxScalingCapacity: 1, // the max number of tasks a service can spin up
      scalingSteps: [{"upper": 0, "change": 0}, {"lower": 1, "change": +1},], // this defines how the service shall autoscale
      environment: params.envVariables,
      image,
      logDriver,
      family: params.stackName + '-task',
    });
    const role = this.queueProcessingFargateService.taskDefinition.taskRole;
    source.grantReadWrite(role);
    destination.grantReadWrite(role);
    params.inlinePolicies?.map((policy, index) => {
      role.attachInlinePolicy(new iam.Policy(this, `${stackName('dynamic-policy', index.toString())}`, {
        statements: [new iam.PolicyStatement({
          actions: policy.actions,
          resources: policy.resources,
        })],
      }));
    });
    role.attachInlinePolicy(new iam.Policy(this, `${stackName('breadth-policy')}`, {
      statements: [new iam.PolicyStatement({
        actions: [
          "appconfig:*",
          "s3:*",
          "sqs:*"],
        resources: ['*'],
      })],
    }));

    /*
     scope: this,
     env: params.env,
     stackName: stackName('thumbnailer-mgr'),
     ecrRepositoryName: 'stokedconsulting/s3-tools-thumbnailer-mgr',
     defaultVpc: true,
     clusterName: 's3-tools-cluster',
     envVariables: {
     ...params.envVariables
     },
     taskDefinition: thumbnailerMgrTask,
     queueProps: {
     queueName: 'thumbnailer-queue',
     receiveMessageWaitTime: Duration.seconds(0),
     retentionPeriod: Duration.seconds(345600),
     visibilityTimeout: Duration.seconds(43200)
     },
     });
     */
    // queueStack

    /*
     const createRole = () => {
     const taskRole = new iam.Role(this, stackName('queue-role'), {
     roleName: stackName('queue-role'),
     assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
     description: 'Allows permissions'
     });

     params.inlinePolicies?.map((policy, index) => {
     taskRole.attachInlinePolicy(new iam.Policy(this, `${stackName('queue-policy', index.toString())}`, {
     statements: [new iam.PolicyStatement({
     actions: policy.actions,
     resources: policy.resources,
     })],
     }));
     });

     return taskRole;
     }

     const taskRole = createRole();

     this.vpc = this.params.defaultVpc ? Vpc.fromLookup(this, 'VPC', { isDefault: params.defaultVpc }) : getVPCByName(this);

     // A regional grouping of one or more container instances on which you can run tasks and services.
     // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs.Cluster.html
     if (!params.cluster && !params.clusterName) {
     this.cluster = new ecs.Cluster(this, stackName('cluster'), {
     vpc: this.vpc,
     clusterName: stackName('cluster'),
     });
     } else if (params.clusterName) {
     const cluster = ecs.Cluster.fromClusterAttributes(this, 'Cluster', {
     clusterName: params.clusterName,
     vpc: this.vpc,
     securityGroups: []
     });
     this.cluster = cluster;
     } else if (params.cluster) {
     this.cluster = params.cluster;
     }

     this.logGroup = new logs.LogGroup(this, `lg`, {
     retention: logs.RetentionDays.ONE_WEEK,
     });

     const logging = new ecs.AwsLogDriver({
     streamPrefix: `${stackPrefix()}-fargate`,
     logGroup: this.logGroup,
     });

     const repoName = params.ecrRepositoryName;
     const repo = Repository.fromRepositoryName(this, repoName, repoName);
     repo.grantRead(taskRole);
     repo.grantPull(taskRole);
     repo.grantPullPush(taskRole);
     const image = ContainerImage.fromEcrRepository(repo, 'latest');

     const taskName = params.taskDefinitionFamily ?? 'queue-task';
     // A task definition that will run FFMPEG on Fargate
     const queueTask = params.taskDefinition ? params.taskDefinition : new ecs.FargateTaskDefinition(this, taskName, {
     memoryLimitMiB: 512,
     cpu: 256,
     taskRole: taskRole,
     family: taskName,
     });


     queueTask.addContainer('s3-tools-thumbnailer-mgr', {
     image: image,
     logging: new ecs.AwsLogDriver({
     streamPrefix: 's3-tools-thumbnailer-mgr',
     logRetention: logs.RetentionDays.ONE_WEEK
     }), environment: {
     ...params.envVariables,
     }
     });

     const getQueue = () => {
     if (params.queue) {
     return params.queue;
     } else if (params.queueProps) {
     return new sqs.Queue(this, stackName('queue'), params.queueProps)
     } else if (params.queueName) {
     let queueProps: sqs.QueueProps = {
     queueName: params.queueName,
     receiveMessageWaitTime: Duration.seconds(20),
     retentionPeriod: Duration.seconds(345600),
     visibilityTimeout: Duration.seconds(43200),
     fifo: params.fifo ? true : undefined,
     contentBasedDeduplication: params.fifo ? true : undefined,
     }
     return new sqs.Queue(this, stackName('queue'), queueProps);
     }
     return new sqs.Queue(this, stackName('queue'), {
     queueName: stackName('fifo-queue.fifo'),
     fifo: params.fifo ? true : undefined,
     contentBasedDeduplication: params.fifo ? true : undefined,
     receiveMessageWaitTime: Duration.seconds(20),
     retentionPeriod: Duration.seconds(345600),
     visibilityTimeout: Duration.seconds(43200)
     })
     }

     // creates a fifo queue
     const queue = getQueue();

     // Create a load-balanced Fargate service and make it public
     // A Fargate service running on an ECS cluster fronted by an application load balancer.
     // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs_patterns.ApplicationLoadBalancedFargateService.html
     this.queueProcessingFargateService = new ecs_patterns.QueueProcessingFargateService(
     this,
     `${stackPrefix()}-fg`,
     {
     cluster: this.cluster, // Required
     assignPublicIp: true,
     serviceName: params.stackName + '-svc' ?? `${stackPrefix()}-svc`,
     queue,
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
     taskDefinition: queueTask,
     logDriver: logging,
     });


     */

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
