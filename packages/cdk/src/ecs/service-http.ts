import { App, Duration, Fn, Stack, StackProps } from 'aws-cdk-lib';
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
import {getDefaultStackEnv, getDomains, getVPCByName, stackPrefix, tagStack} from '../utils';
import { CenvFiles } from '@stoked-cenv/lib';

export interface EcsHttpDeploymentParams {
  env: string;
  id?: string;
  envVariables?: Record<string, string>;
  taskImageOptions?: Partial<ecs_patterns.ApplicationLoadBalancedTaskImageOptions>;
  stackProps?: StackProps;
  stackName: string;
  subdomain: string;
  ecrRepositoryName: string;
  logRetention?: logs.RetentionDays;
  rootDomain?: string;
  region?: string;
  healthCheck: HealthCheck,
  assignedDomain?: string;
  actions?: string[];
}

export class EcsHttpStack extends Stack {
  vpc: IVpc;
  cluster: ecs.Cluster;
  loadBalancedFargateService: ecs_patterns.ApplicationLoadBalancedFargateService;
  zone: IHostedZone;
  scalableTarget: ecs.ScalableTaskCount;
  logGroup: logs.LogGroup;
  params: EcsHttpDeploymentParams;

  constructor(params: EcsHttpDeploymentParams) {
    super(new App(), params.id ?? `${params.env}-${params.stackName}`, params.stackProps ?? getDefaultStackEnv());
    const {
      env,
      subdomain,
      ecrRepositoryName,
      envVariables = {},
      logRetention = logs.RetentionDays.ONE_WEEK,
      region = process.env.CDK_DEFAULT_REGION,
      healthCheck,
    } = params;
    this.params = params;

    this.vpc = getVPCByName(this);

    const domains = getDomains(subdomain);

    // A regional grouping of one or more container instances on which you can run tasks and services.
    // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs.Cluster.html
    this.cluster = new ecs.Cluster(this, `${stackPrefix()}-cluster`, {
      vpc: this.vpc,
      clusterName: `${stackPrefix()}-cluster`,
    });

    // Lookup a hosted zone in the current account/region based on query parameters.
    // Requires environment, you must specify env for the stack.
    // Use to easily query hosted zones.
    this.zone = HostedZone.fromLookup(this, 'zone', {
      domainName: domains.root!,
    });

    // A certificate managed by AWS Certificate Manager.
    // Will be automatically validated using DNS validation against the specified Route 53 hosted zone.
    // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_certificatemanager.DnsValidatedCertificate.html
    const certImport = Fn.importValue(`${stackPrefix()}-cert`);
    const certificate = Certificate.fromCertificateArn(this, `${stackPrefix()}-cert`, certImport);

    this.logGroup = new logs.LogGroup(this, `lg`, {
      retention: logRetention,
    });

    const logging = new ecs.AwsLogDriver({
                                           streamPrefix: `${stackPrefix()}-fargate`, logGroup: this.logGroup,
                                         });

    const repository = ecr.Repository.fromRepositoryName(this, ecrRepositoryName.replace('/', '-'), ecrRepositoryName);
    const shortDigest = process.env.CENV_PKG_DIGEST ? process.env.CENV_PKG_DIGEST!.substring(process.env.CENV_PKG_DIGEST!.length - 8) : '';
    const containerName = `${stackPrefix()}-${process.env.CENV_PKG_VERSION}-${shortDigest}`.replace(/\./g, '-');

    const image = ecs.ContainerImage.fromEcrRepository(repository, 'latest');
    // Create a load-balanced Fargate service and make it public
    // A Fargate service running on an ECS cluster fronted by an application load balancer.
    // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs_patterns.ApplicationLoadBalancedFargateService.html
    this.loadBalancedFargateService = new ecs_patterns.ApplicationLoadBalancedFargateService(
      this,
      `${stackPrefix()}-fg`,
      {
        cluster: this.cluster, // Required
        assignPublicIp: true,
        loadBalancerName: `${stackPrefix()}-lb`,
        serviceName: `${stackPrefix()}-svc`, cpu: 256, // Default is 256 // 0.25 CPU
        desiredCount: 1, // Default is 1
        domainZone: this.zone,
        domainName: domains.primary,
        certificate,
        taskImageOptions: {
          family: `${stackPrefix()}`,
          containerName,
          image,
          logDriver: logging,
          ...this.getTaskImageOptions(),
          environment: {
            PORT: '80',
            ENV: env!,
            AWS_ACCOUNT_ID: process.env.CDK_DEFAULT_ACCOUNT!,
            ...envVariables,
          },
        }, memoryLimitMiB: 512, // Default is 512
        publicLoadBalancer: true, // Default is false,
      });

    if (this.params.actions) {
      // attach inline policy for interacting with AppConfig
      this.loadBalancedFargateService.taskDefinition.taskRole?.attachInlinePolicy(new iam.Policy(this, `${stackPrefix()}-config`, {
        statements: [new iam.PolicyStatement({
          actions: this.params.actions,
          resources: ['*'],
        })],
      }));
    }

    tagStack(this);

    // configure health check
    const hChk: HealthCheck = {
      path: healthCheck.path,
      interval: Duration.seconds(10),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 10
    };

    this.loadBalancedFargateService.targetGroup.configureHealthCheck(hChk);

    // An attribute representing the minimum and maximum task count for an AutoScalingGroup.
    this.scalableTarget = this.loadBalancedFargateService.service.autoScaleTaskCount({
                                                                                       minCapacity: 1, maxCapacity: 5,
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
                            metricName: 'CPUUtilization', namespace: 'ECS/ContainerInsights', dimensionsMap: {
        ServiceName: this.loadBalancedFargateService.service.serviceName, ClusterName: this.cluster.clusterName,
      }, statistic: 'avg', period: Duration.minutes(5),
                          });

    new cloudwatch.Metric({
                            metricName: 'MemoryUtilization', namespace: 'ECS/ContainerInsights', dimensionsMap: {
        ServiceName: this.loadBalancedFargateService.service.serviceName, ClusterName: this.cluster.clusterName,
      }, statistic: 'avg', period: Duration.minutes(5),
                          });
  }

  getTaskImageOptions(): Partial<ecs_patterns.ApplicationLoadBalancedTaskImageOptions> {
    return {};
  }
}
