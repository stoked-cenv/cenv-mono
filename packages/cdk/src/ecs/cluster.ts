import {App, Stack, StackProps} from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import {IVpc} from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import {getDefaultStackEnv, getVPCByName, stackPrefix} from '../utils';

export interface ClusterParams {
  env: string;
  id?: string;
  stackProps?: StackProps;
  stackName: string;
  subdomain: string;
  logRetention?: logs.RetentionDays;
}

export class ClusterStack extends Stack {
  vpc: IVpc;
  cluster: ecs.Cluster;

  constructor(params: ClusterParams) {
    super(new App(), params.id ?? `${params.env}-${params.stackName}`, params.stackProps ?? getDefaultStackEnv());

    this.vpc = getVPCByName(this);

    // A regional grouping of one or more container instances on which you can run tasks and services.
    // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs.Cluster.html
    this.cluster = new ecs.Cluster(this,
      `${stackPrefix()}-cluster`,
      {
        vpc: this.vpc,
        clusterName: `${stackPrefix()}-cluster`,
    });
  }
}
