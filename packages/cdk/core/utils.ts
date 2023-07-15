import { App,Stack } from 'aws-cdk-lib';
import {CenvLog, validateEnvVars} from "@stoked-cenv/lib";
import {HostedZone} from "aws-cdk-lib/aws-route53";
import {SiteCertificateStack} from "../stacks/cert/site-certificate-stack.js";
import * as cdk from "aws-cdk-lib";

const envVars = validateEnvVars(['ENV', 'ROOT_DOMAIN']);

export function tagStack(stack: Stack) {
  tagIfExists(stack, "CENV_PKG_VERSION");
  tagIfExists(stack, "CENV_PKG_DIGEST");
}

export function tagIfExists(stack: Stack, EnvVar: string) {
  if (process.env[EnvVar]) {
    console.log(`[${envVars.ENV}] stack tag: { ${EnvVar}: ${process.env[EnvVar]!} }`)
    stack.tags.setTag(EnvVar, process.env[EnvVar]!, 1);
  }
}

export function ensureValidCerts(domain: string) {
  if (domain) {
    const domainParts = domain.split('.');
    const subDomain = domainParts.shift()
    const assignedRootDomain = domainParts.join('.');
    const rootEnd = '.' + envVars.ROOT_DOMAIN;
    if (!assignedRootDomain.endsWith(rootEnd)) {
      CenvLog.single.catchLog(new Error(`the assigned domain must be a sub domain of the rootDomain - assignedDomain: ${domain}, rootDomain: ${envVars.ROOT_DOMAIN}`))
    }

    const ecsServiceDomain = HostedZone.fromLookup(new App(), 'zone', {
      domainName: assignedRootDomain
    });

    if (!ecsServiceDomain) {
      let nextSub: string = domain.substring(0, domain.indexOf(rootEnd));
      const assignedParts = nextSub.split('.');

      let baseDomain: string = envVars.ROOT_DOMAIN;
      while(subDomain !== nextSub) {
        nextSub = assignedParts.pop() as string;
        new SiteCertificateStack(new cdk.App(), `${envVars.ENV}-${nextSub}-${baseDomain.replace('.', '-')}`, {
          env: {account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION}
        });
        baseDomain = `${nextSub}.${baseDomain}`;
        nextSub = assignedParts.pop() as string;
      }
    }
  }
}
