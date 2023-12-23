import * as cdk from 'aws-cdk-lib';
import { App, Stack } from 'aws-cdk-lib';
import { CenvFiles, CenvLog, Package } from '@stoked-cenv/lib';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import { SiteCertificateStack } from './stacks/cert/site-certificate-stack';
import process from 'process';
import { Construct } from 'constructs';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { ContainerImage } from 'aws-cdk-lib/aws-ecs';

export function stackPrefix() {
  return `${CenvFiles.ENVIRONMENT}-${process.env.APP}`;
}

export function stackName(name: string, suffix?: string) {
  return `${stackPrefix()}-${name}${suffix ? '-' + suffix : ''}`;
}

export function tagStack(stack: Stack) {
  tagIfExists(stack, 'CENV_PKG_VERSION');
  tagIfExists(stack, 'CENV_PKG_DIGEST');
  tagIfExists(stack, 'CENV_ENVIRONMENT', 'ENV');
  tagIfExists(stack, 'CENV_APPLICATION_NAME');
}

export const VPC_NAME = `${CenvFiles.ENVIRONMENT}-net`;

export const getVPCByName = (construct: Construct, id = CenvFiles.ENVIRONMENT + '-net', vpcName = VPC_NAME) => Vpc.fromLookup(construct, id, {
  vpcName,
});

export function getDefaultStackEnv() {
  return{
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    },
  };
}

export function createContainer(packageName: string) {
  const pkg = new Package(packageName);
  pkg.deploy({});
}

export function getImage(construct: Construct, repositoryName: string) {
  const repo = Repository.fromRepositoryName(construct, repositoryName, repositoryName);
  return ContainerImage.fromEcrRepository(repo, 'latest');
}

export function tagIfExists(stack: Stack, EnvVar: string, EnvVarValue?: string) {
  if (process.env[EnvVarValue || EnvVar]) {
    console.log(`[${CenvFiles.ENVIRONMENT}] stack tag: { ${EnvVar}: ${process.env[EnvVarValue || EnvVar]!} }`);
    stack.tags.setTag(EnvVar, process.env[EnvVarValue || EnvVar]!, 1);
  }
}

export function ensureValidCerts(primary: string, root: string) {
  if (primary) {
    const domainParts = primary.split('.');
    const subDomain = domainParts.shift();
    const assignedRootDomain = domainParts.join('.');
    const rootEnd = '.' + root;
    if (!primary.endsWith(root)) {
      CenvLog.single.catchLog(new Error(`the assigned domain must be a sub domain of the rootDomain - primary domain: ${primary}, rootDomain: ${root}`));
    }

    const ecsServiceDomain = HostedZone.fromLookup(new App(), 'zone', {
      domainName: root,
    });

    if (!ecsServiceDomain) {
      let nextSub: string = primary.substring(0, primary.indexOf(rootEnd));
      const assignedParts = nextSub.split('.');

      let currDomain = root;
      while (subDomain !== nextSub) {
        nextSub = assignedParts.pop() as string;
        new SiteCertificateStack(new cdk.App(), `${primary.replace(/\./g, '-')}`, {
          env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
        });
        currDomain = `${nextSub}.${root}`;
        nextSub = assignedParts.pop() as string;
      }
    } else {
      CenvLog.single.infoLog(`${assignedRootDomain} certificate verified`);
    }
  }
}

export function getDomains(subdomain?: string) {
  const APP = process.env.APP;
  console.log('APP: ' + APP);
  const ROOT_DOMAIN = process.env.ROOT_DOMAIN;
  console.log('ROOT_DOMAIN: ' + ROOT_DOMAIN);
  const DOMAIN = process.env.DOMAIN;
  console.log('DOMAIN: ' + DOMAIN);
  const rootDomain = DOMAIN || ROOT_DOMAIN!;
  const rootDomainParts = rootDomain.split('.');
  const ENV = CenvFiles.ENVIRONMENT;
  const appIfNotSameAsRoot = APP && rootDomainParts.shift() !== APP ? APP : undefined;
  console.log('appIfNotSameAsRoot', appIfNotSameAsRoot);
  const appMatchesRoot = !appIfNotSameAsRoot;
  let finalDomains = null;
  console.log('subdomain', subdomain);
  for (let i = 0; i < subdomain?.split(',').length; i++) {
    let subdomainInstance = subdomain.split(',')[i];
    subdomainInstance = `${subdomainInstance ? subdomainInstance + '.' : ''}`;
    const app = appIfNotSameAsRoot ? `${APP}.${rootDomain}` : rootDomain;
    const env = `${subdomainInstance}${ENV}.${app}`;
    const sub = `*.${env}`;
    const domains: {env: string, sub: string, app?: string, primary: string, alt: string[], root: string, www?: string} = { env, sub, primary: env, alt: [sub], root: rootDomain }
    if (finalDomains) {
      finalDomains.alt.push(env);
      finalDomains.alt.push(sub);
    } else  if (ENV === 'prod') {
      domains.app = app;
      domains.primary = `${subdomainInstance}${app}`;
      domains.alt = [`*.${app}`, env, sub];
      if (appMatchesRoot) {
        domains.www = `www.${app}`;
        domains.alt.push(domains.www);
      }
    }
    finalDomains = domains;

    console.log('primary domain: ' + domains.primary);
    if (domains.app) {
      console.log('app domain: ' + domains.app);
    }
    console.log('environment domain: ' + domains.env);
    console.log('subDomain: ' + domains.sub);
    console.log('rootDomain: ' + domains.root);
    console.log('altDomains: ' + domains.alt.join(', '));
  }
  return finalDomains;
}
