import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import { Certificate, CertificateValidation, DnsValidatedCertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { getDomains, stackPrefix, tagStack } from '../../index';

const {
  ENV, ROOT_DOMAIN, ASSIGNED_DOMAIN,  APP,
} = process.env;

export class SiteCertificateStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    const domains = getDomains();


    const zone = HostedZone.fromLookup(this, `${stackPrefix()}-zone`, {
      domainName: domains.root,
    });

    const certificate = new  Certificate(this, `${stackPrefix()}-site-cert`, {
      domainName: domains.primary,
      subjectAlternativeNames: domains.alt, // Cloudfront only checks this region for certificates.
      validation: CertificateValidation.fromDns(zone)
    });

    const exportName = `${stackPrefix()}-cert`;
    new CfnOutput(this, 'SiteCertificateArn', {
      value: certificate.certificateArn,
      exportName
    });

    tagStack(this);
  }
}
