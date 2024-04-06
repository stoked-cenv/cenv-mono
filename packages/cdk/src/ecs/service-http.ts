import { App, aws_cloudwatch, CfnOutput, Duration, Fn, Stack, StackProps } from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { HealthCheck } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { ARecord, HostedZone, IHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as targets from 'aws-cdk-lib/aws-route53-targets';

import * as appscaling from 'aws-cdk-lib/aws-applicationautoscaling';
import { AdjustmentType } from 'aws-cdk-lib/aws-applicationautoscaling';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';

import { getDefaultStackEnv, getDomains, getVPCByName, stackPrefix, tagStack } from '../utils';

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
  createCluster: boolean;
}

export class EcsHttpStack extends Stack {
  vpc: IVpc;
  cluster: ecs.ICluster;
  httpService: ecs_patterns.ApplicationLoadBalancedFargateService;
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
      createCluster = params.createCluster ?? true
    } = params;
    this.params = params;

    this.vpc = getVPCByName(this);

    const domains = getDomains(subdomain);

    if (createCluster) {
      // A regional grouping of one or more container instances on which you can run tasks and services.
      // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs.Cluster.html
      this.cluster = new ecs.Cluster(this, `${stackPrefix()}-cluster`, {
        vpc: this.vpc, clusterName: `${stackPrefix()}-cluster`,
        containerInsights: true
      });
    } else {
      this.cluster = ecs.Cluster.fromClusterAttributes(this, `${stackPrefix()}-cluster`, {
        clusterName: `${stackPrefix()}-cluster`,
        vpc: this.vpc,
        securityGroups: [],
      });
    }

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

    const serviceName = `${stackPrefix()}-svc`;
      const image = ecs.ContainerImage.fromEcrRepository(repository, 'latest');
    // Create a load-balanced Fargate service and make it public
    // A Fargate service running on an ECS cluster fronted by an application load balancer.
    // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs_patterns.ApplicationLoadBalancedFargateService.html
    this.httpService = new ecs_patterns.ApplicationLoadBalancedFargateService(
      this,
      `${stackPrefix()}-fg`,
      {
        cluster: this.cluster, // Required
        assignPublicIp: true,
        loadBalancerName: `${stackPrefix()}-lb`,
        serviceName: `${stackPrefix()}-svc`,
        cpu: 256, // Default is 256 // 0.25 CPU
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


    if (process.env.CENV_SECONDARY_CONTAINER_PORT && this.httpService.loadBalancer.listeners.length) {
      const listener = this.httpService.loadBalancer.listeners[0];

      this.httpService.taskDefinition.defaultContainer?.addPortMappings({
        containerPort: parseInt(process.env.CENV_SECONDARY_CONTAINER_PORT),
      });

      const target = this.httpService.service.loadBalancerTarget({
        containerName: containerName,
        containerPort: parseInt(process.env.CENV_SECONDARY_CONTAINER_PORT)
      });

      listener.addTargets('secondaryTarget', {
        targets: [target],
        protocol: elbv2.ApplicationProtocol.HTTP,
        conditions: [
          elbv2.ListenerCondition.hostHeaders([process.env.CENV_SECONDARY_HEADER]),
        ],
        priority: 100,
        healthCheck: {
          path: '/',
          interval: Duration.minutes(1)
        }
      });

      new ARecord(this, `${stackPrefix()}-sec-a`, {
        recordName: process.env.CENV_SECONDARY_HEADER,
        target: RecordTarget.fromAlias(new targets.LoadBalancerTarget(this.httpService.loadBalancer)),
        zone: this.zone,
      });

    }

    if (this.params.actions) {
      // attach inline policy for interacting with AppConfig
      this.httpService.taskDefinition.taskRole?.attachInlinePolicy(new iam.Policy(this, `${stackPrefix()}-config`, {
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

    this.httpService.targetGroup.configureHealthCheck(hChk);



    const scalableTarget = new appscaling.ScalableTarget(this, 'ScalableTarget', {
      serviceNamespace: appscaling.ServiceNamespace.ECS,
      resourceId: `service/${this.cluster.clusterName}/${serviceName}`,
      scalableDimension: 'ecs:service:DesiredCount',
      minCapacity: 0,
      maxCapacity: 1,
    });

    const metricIn = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'ActiveConnectionCount',
      dimensionsMap: {
        LoadBalancer: `app/${this.httpService.loadBalancer.loadBalancerFullName}`
      },
      period: Duration.minutes(1)
    });

    scalableTarget.scaleOnMetric('ActiveConnectionScaling', {
      metric: metricIn,
      scalingSteps: [
        { upper: 1, change: -1 }, // Scale in when requests per minute are below 1000
        { lower: 1, change: +1 },
      ],
      adjustmentType: AdjustmentType.CHANGE_IN_CAPACITY
    });

/*
    // Output the DNS where the service is available
    new CfnOutput(this, 'ServiceURL', {
      value: this.httpService.loadBalancer.loadBalancerDnsName,
    });


    const scalableTarget = new appscaling.ScalableTarget(this, 'ScalableTarget', {
      serviceNamespace: appscaling.ServiceNamespace.ECS,
      resourceId: `service/${this.cluster.clusterName}/${serviceName}`,
      scalableDimension: 'ecs:service:DesiredCount',
      minCapacity: 0,
      maxCapacity: 1,
    });
    const scalingPolicy = new appscaling.TargetTrackingScalingPolicy(this, 'ScalingPolicy', {
      policyName: 'RequestCountScalingPolicy',
      targetValue: 1,
      scaleOutCooldown: Duration.seconds(60),
      scaleInCooldown: Duration.seconds(60),
      scalingTarget: scalableTarget,
      customMetric: {

      }
    });


    const metricOut = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'HTTPCode_ELB_503_Count',
      cus
      dimensionsMap: {
        LoadBalancer: `app/${this.httpService.loadBalancer.loadBalancerFullName}`
        TargetGr
      },
      period: Duration.minutes(1)
    });

    scalableTarget.scaleOnMetric('RequestCountScalingOut', {
      metric: metricOut,
      scalingSteps: [
        { lower: 1, change: +1 },
        { lower: 0, change: +1 }, // Scale out when requests per minute exceed 2000
      ],
      adjustmentType: AdjustmentType.CHANGE_IN_CAPACITY
    });

    const metricIn = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'ActiveConnectionCount',
      dimensionsMap: {
        LoadBalancer: `app/${this.httpService.loadBalancer.loadBalancerFullName}`
      },
      period: Duration.minutes(1)
    });

    scalableTarget.scaleOnMetric('RequestCountScalingIn', {
      metric: metricIn,
      scalingSteps: [
        { upper: 1, change: -1 }, // Scale in when requests per minute are below 1000
        { upper: 2, change: -1 },
      ],
      adjustmentType: AdjustmentType.CHANGE_IN_CAPACITY
    });

*/
    /*
       const scalableTarget = this.httpService.service.autoScaleTaskCount({
         minCapacity: 0,
         maxCapacity: 1,
       });

       scalableTarget.scaleOnMetric('RequestCountScaling', {
         requestsPerTarget: 1,
         targetGroup: this.httpService.targetGroup,
         scaleInCooldown: Duration.hours(1),
         scaleOutCooldown: Duration.seconds(30),
       });

       // An attribute representing the minimumnd maximum task count for an AutoScalingGroup.
       /*this.scaleTarget = this.httpService.service.autoScaleTaskCount({
                                                                                          minCapacity: 0, maxCapacity: 1,
                                                                                        });

       // Scales in or out to achieve a target CPU utilization.
       this.scalableTarget.scaleOnCpuUtilization('CpuScaling', {
         targetUtilizationPercent: 50,
       });

       // Scales in or out to achieve a target memory utilization.
       this.scalableTarget.scaleOnMemoryUtilization('MemoryScaling', {
         targetUtilizationPercent: 50,
       });

       const scalableTarget = new autoscaling.ScalableTarget(this, 'ScalableTarget', {
         serviceNamespace: autoscaling.ServiceNamespace.ECS,
         resourceId: `service/${this.cluster.clusterName}/${serviceName}`,
         scalableDimension: 'ecs:service:DesiredCount',
         minCapacity: 0,
         maxCapacity: 1,
       });

       const scalingPolicy = new autoscaling.TargetTrackingScalingPolicy(this, 'ScalingPolicy', {
         policyName: 'RequestCountScalingPolicy',
         targetValue: 1000,
         scaleOutCooldown: Duration.seconds(60),
         scaleInCooldown: Duration.seconds(60),
         scalingTarget: scalableTarget,
         predefinedMetric: autoscaling.PredefinedMetric.ALB_REQUEST_COUNT_PER_TARGET,
         resourceLabel: `app/${this.httpService.loadBalancer.loadBalancerFullName}/${this.httpService.targetGroup.targetGroupFullName}`
       });


       scalableTarget.scaleToTrackMetric('Tracking', {
         targetValue: 50000,
         predefinedMetric: autoscaling.PredefinedMetric.ALB_REQUEST_COUNT_PER_TARGET,
       });


       new cloudwatch.Metric({
                               metricName: 'CPUUtilization', namespace: 'ECS/ContainerInsights', dimensionsMap: {
           ServiceName: this.httpService.service.serviceName,
           ClusterName: this.cluster.clusterName,
         }, statistic: 'avg', period: Duration.minutes(5),
                             });

       new cloudwatch.Metric({
                               metricName: 'MemoryUtilization', namespace: 'ECS/ContainerInsights', dimensionsMap: {
           ServiceName: this.httpService.service.serviceName, ClusterName: this.cluster.clusterName,
         }, statistic: 'avg', period: Duration.minutes(5),
                             });


     */
  }

  getTaskImageOptions(): Partial<ecs_patterns.ApplicationLoadBalancedTaskImageOptions> {
    return {};
  }
}
