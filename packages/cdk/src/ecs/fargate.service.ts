  import {
  ECSClient,
  CreateServiceCommand,
  CreateServiceCommandInput
} from '@aws-sdk/client-ecs';

const client = new ECSClient({ region: process.env.AWS_REGION || 'us-east-1' });

export class FargateService {
  private serviceName?: CreateServiceCommandInput['serviceName'];
  private cluster?: CreateServiceCommandInput['cluster'];
  private networkConfiguration?: CreateServiceCommandInput['networkConfiguration'];

  constructor({
    serviceName,
    cluster,
    networkConfiguration
  }: {
    serviceName: CreateServiceCommandInput['serviceName'];
    cluster: CreateServiceCommandInput['cluster'];
    networkConfiguration?: CreateServiceCommandInput['networkConfiguration'];
  }) {
    this.serviceName = serviceName;
    this.cluster = cluster;
    this.networkConfiguration = networkConfiguration;
  }

  async create() {
    const command = new CreateServiceCommand({
      cluster: this.cluster,
      serviceName: this.serviceName,
      networkConfiguration: this.networkConfiguration,
      launchType: 'FARGATE'
    });
    try {
      const data = await client.send(command);
      console.log('Started Fargate service', data.service);
    } catch (err) {
      console.log('Start task failed', err);
    }
  }
}
