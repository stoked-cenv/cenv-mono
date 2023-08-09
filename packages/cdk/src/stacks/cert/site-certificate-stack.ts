import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import { Certificate, CertificateValidation, DnsValidatedCertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { stackPrefix, tagStack } from '../../index';

const {
  ENV, ROOT_DOMAIN, ASSIGNED_DOMAIN,  APP,
} = process.env;

export class SiteCertificateStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    const rootDomain = ROOT_DOMAIN!;
    const rootDomainParts = rootDomain.split('.');
    if (rootDomainParts.length > 1) {
      rootDomainParts.pop();
    }
    const app = APP && rootDomainParts.join('.') !== APP ? APP : undefined;
    const domainName = app ? `${APP}.${rootDomain}` : rootDomain;
    const appDomain = `${ENV}.${domainName}`;
    const subDomain = `*.${ENV}.${domainName}`;
    const altDomains = [subDomain];
    if (ENV === 'prod' && ASSIGNED_DOMAIN) {
      altDomains.push(`${ASSIGNED_DOMAIN}`);
    }

    console.log('appDomain: ' + appDomain);
    console.log('subDomain: ' + subDomain);
    console.log('altDomains: ' + altDomains.join(', '));

    const zone = HostedZone.fromLookup(this, `${stackPrefix()}-zone`, {
      domainName: rootDomain,
    });

    const certificate = new  Certificate(this, `${stackPrefix()}-site-cert`, {
      domainName: appDomain,
      subjectAlternativeNames: altDomains, // Cloudfront only checks this region for certificates.
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
