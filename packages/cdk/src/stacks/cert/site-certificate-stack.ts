import {CfnOutput, Stack, StackProps} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {HostedZone} from 'aws-cdk-lib/aws-route53';
import {DnsValidatedCertificate} from 'aws-cdk-lib/aws-certificatemanager';
import {tagStack} from '../../index';

const {
  ENV, ROOT_DOMAIN, CDK_DEFAULT_REGION, CENV_STACK_NAME, CENV_CERT_SUBDOMAIN, CENV_CERT_ROOT_DOMAIN, APP
} = process.env;

export class SiteCertificateStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const domainName = ROOT_DOMAIN!;
    const appDomain = `*.${APP}.${ENV}.${domainName}`;
    const envDomain = `*.${ENV}.${domainName}`;
    const altDomains = [envDomain];
    if (ENV === 'prod') {
      altDomains.push(`${APP}.${domainName}`);
    }

    console.log("ROOT_DOMAIN: " + ROOT_DOMAIN!);
    console.log("ENV: " + ENV!);
    console.log("APP: " + APP!);
    console.log("   ---")
    console.log("domainName: " + domainName);
    console.log("envDomain: " + envDomain);
    console.log("appDomain: " + appDomain);

    const zone = HostedZone.fromLookup(this, "zone", {
      domainName: domainName
    });

    const certificate = new DnsValidatedCertificate(this, 'SiteCertificate', {
      domainName: appDomain, hostedZone: zone, subjectAlternativeNames: altDomains, region: CDK_DEFAULT_REGION, // Cloudfront only checks this region for certificates.
    },);

    new CfnOutput(this, 'SiteCertificateArn', {
      value: certificate.certificateArn, exportName: `${ENV}-site-cert`
    });

    tagStack(this);
  }
}
