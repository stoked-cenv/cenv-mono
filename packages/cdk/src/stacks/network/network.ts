import { Stack, StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { tagStack } from '../../index';
import {SSM} from "aws-sdk";

const {
  ENV,
} = process.env;

const environment = ENV;

// This code generates a random CIDR block in the 192.168.0.0/16 address range,
// which is also reserved for private networks like AWS VPCs.
// The first two octets are randomly generated, and the third octet is chosen randomly from 0 to 255.
// The fourth octet is always 0, and the subnet mask is fixed at /24 to ensure that
// the generated CIDR block falls within the AWS VPC IP address range.
//
// Note that you can adjust the CIDR block to fit your specific needs
// by changing the prefix length (e.g., /16, /20, /24, etc.).
const generateAwsCidr = () => {
  if (process.env.CENV_NETWORK_CIDR) {
    return process.env.CENV_NETWORK_CIDR;
  }
  const octet2 = Math.floor(Math.random() * 255);
  const subnet = Math.floor(Math.random() * 255);
  return `10.${octet2}.0.0/24`;
};

export class NetworkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Vpc creates a VPC that spans a whole region.
    // It will automatically divide the provided VPC CIDR range,
    // and create public and private subnets per Availability Zone.
    // Network routing for the public subnets will be configured to
    // allow outbound access directly via an Internet Gateway.
    // Network routing for the private subnets will be configured to
    // allow outbound access via a set of resilient NAT Gateways (one per AZ).
    // https://docs.aws.amazon.com/cdk/api/v1/docs/@aws-cdk_aws-ec2.Vpc.html
    const cidr = generateAwsCidr();
    const vpc = new ec2.Vpc(this, `${ENV}-net`, {
      vpcName: `${ENV}-net`, gatewayEndpoints: {
        S3: {
          service: ec2.GatewayVpcEndpointAwsService.S3
        },
        DYNAMODB: {
          service: ec2.GatewayVpcEndpointAwsService.DYNAMODB
        },
      },
      ipAddresses: ec2.IpAddresses.cidr(cidr),
    });

    vpc.addInterfaceEndpoint(`${ENV}-erc-docker-ep`, {
      service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
    });

    vpc.addInterfaceEndpoint(`${ENV}-erc-api-ep`, {
      service: ec2.InterfaceVpcEndpointAwsService.ECR,
    });

    /*
    new ssm.StringListParameter(this, `${ENV}-network-refs`, {
      parameterName: `/component/${process.env.ENV}/cdk-network/refs`,
      description: "references to this component",
      stringListValue: [process.env.APP!],
    });
    */

    this.exportValue(cidr, {
      name: `${ENV}-cidr`,
    });

    this.exportValue(vpc.vpcDefaultSecurityGroup, {
      name: `${environment}-vpc-sg`,
    });

    this.exportValue(vpc.vpcId, {
      name: `${ENV}-network-id`,
    });

    tagStack(this);
  }
}
