import { PackageModule, PackageModuleType, ProcessMode } from './module';
import { Stack, StackSummary } from '@aws-sdk/client-cloudformation';
import { s3sync, deleteStack, describeStacks, createInvalidation } from '../aws';
import { parse, SemVer } from 'semver';
import { CenvLog, LogLevel } from '../log';
import { removeScope, semVerParse } from '../utils';
import { CommandEvents, Package, PackageCmd, TPackageMeta } from './package';
import * as path from 'path';
import {CenvFiles, IParameter} from '../file'
import { runScripts } from '../proc';
import { Deployment } from '../deployment';
import {inspect} from 'util';
import {ParamsModule} from './params';
import {writeFileSync} from 'fs';

export enum StackType {
  ECS = 'ECS', LAMBDA = 'LAMBDA', ACM = 'ACM', SPA = 'SPA', NETWORK = 'NETWORK'
}

interface NameReplacer {
  name: string;
  regex: RegExp;
}

export class StackModule extends PackageModule {

  public static get cdkExe(): string {
    return 'cdk';
  }

  static commands = [
    `${this.cdkExe} deploy --require-approval never --no-color -m direct`,
    `${this.cdkExe} destroy --force --no-color`,
    `${this.cdkExe} synth`,
    `${this.cdkExe} diff`];
  detail?: Stack;
  verified = false;
  summary?: StackSummary;
  stackVersion?: SemVer;
  stackType?: StackType;

  constructor(pkg: Package, path: string, meta: TPackageMeta) {
    super(pkg, path, meta, PackageModuleType.STACK);
    this.stackType = this.pkg.fullType === 'services' ? StackType.ECS : StackType.LAMBDA;
  }


  get statusText(): string {
    if (this.upToDate()) {
      return 'up to date';
    } else if (this.detail) {
      return 'need to deploy the latest version';
    }
    return 'stack not deployed';
  }

  get anythingDeployed(): boolean {
    return (this.verified || !!this.detail || !!this.deployedDigest || !!this.stackVersion);
  }

  get moduleStrings(): string[] {
    const items = super.moduleBaseStrings;
    if (this.deployedDigest) {
      items.push(`deployed digest: ${this.deployedDigest}`);
    }
    if (this.detail?.LastUpdatedTime) {
      items.push(`latest stack deployed: ${this.detail?.LastUpdatedTime}`);
    }
    return items;
  }

  get deployedDigest(): string | false {
    return this.getTag('CENV_PKG_DIGEST', this.pkg.stackName);
  }

  get deployedDigestShort(): string | false {
    const digestTag = this.getTag('CENV_PKG_DIGEST', this.pkg.stackName);
    if (!digestTag) {
      return false;
    }
    return digestTag.substring(digestTag.length - 8);
  }

  get hasLatestDeployedVersion(): boolean {
    if (this?.stackVersion === undefined) {
      return false;
    }
    return (this.pkg.rollupVersion?.toString() === parse(this?.stackVersion)?.toString());
  }

  get hasLatestDeployedDigest(): boolean {
    if (!this.pkg?.stack || this?.deployedDigest === false) {
      return false;
    }
    return this.pkg?.docker?.latestDigest === this?.deployedDigest && !!this.pkg?.docker.latestDigest;
  }

  static fromModule(module: PackageModule) {
    return new StackModule(module.pkg, module.path, module.meta);
  }

  async destroy(packageCmd?: PackageCmd) {
    try {
      if (Deployment.options.hard) {
        const deployCmd = this.pkg.createCmd(`cenv destroy ${this.pkg.packageName} --hard`);
        await deleteStack(this.pkg.stackNameFinal, true, true);
        deployCmd.result(0);
      } else {
        let actualCommand = StackModule.commands[Object.keys(ProcessMode).indexOf(ProcessMode.DESTROY)];
        actualCommand += ` -o ${this.getCdkOut()}`;

        let opt: any = { cenvVars: {} };
        opt = await this.getOptions(opt, ProcessMode.DESTROY);
        opt.parentCmd = packageCmd;
        opt.cdkSupported = ProcessMode.DESTROY;
        await this.pkg.pkgCmd(actualCommand, opt);
      }

      if (this.pkg.component && !this.pkg.instance) {
        await ParamsModule.removeComponentRef(this.pkg);
      }
      return true;
    } catch (e) {
      CenvLog.single.errorLog('destroy failed:' +  e, this.pkg.stackName, true);
      throw e;
    }
  }

  async synth() {
    let actualCommand = StackModule.commands[Object.keys(ProcessMode).indexOf(ProcessMode.SYNTH)];
    actualCommand += ` -o ${this.getCdkOut()}`;

    const opt: any = await this.getOptions({ cenvVars: {} }, ProcessMode.DESTROY);
    opt.cdkSupported = ProcessMode.SYNTH;
    await this.pkg.pkgCmd(actualCommand, opt);
  }

  async deploy(deployOptions: any, options: any) {
    if (this.needsAutoDelete()) {
      await this.destroy();
    }

    await runScripts(this, this.meta.preDeployScripts);

    if (!process.env.CENV_SKIP_CDK) {
      const opt = await this.getOptions({}, ProcessMode.DEPLOY);
      await this.resetVolatileKeys(opt);

      if (this.meta.deployStack) {
        opt.cdkSupported = ProcessMode.DEPLOY;
        return await this.pkg.pkgCmd(this.meta.deployStack, opt);
      }

      let deployCommand = StackModule.commands[Object.keys(ProcessMode).indexOf(ProcessMode.DEPLOY)];
      let skip = false;
      if (deployOptions.force || process.env.CENV_CDK_SYNTH) {
        deployCommand += ' --force';
        let diffCommand = StackModule.commands[Object.keys(ProcessMode).indexOf(ProcessMode.DIFF)];
        const diffRes = await this.pkg.pkgCmd(diffCommand,  {...opt, failOnError: false, returnOutput: false});
        if (diffRes.stdout === "") {
          skip = true;
        }
      }

      if (CenvLog.logLevel === LogLevel.VERBOSE) {
        CenvLog.single.infoLog(inspect({...opt, dashboardOptions: undefined,  }));
      }
      deployCommand += ` -o ${this.getCdkOut()}`;
      if (!skip) {
        opt.cdkSupported = ProcessMode.DEPLOY;
        await this.pkg.pkgCmd(deployCommand, opt);

        CenvLog.single.infoLog(' uniqueId: ' + opt.pkgCmd?.uniqueId + ' - ' + JSON.stringify(this.pkg.cdkProcesses[this.pkg.cmds[this.pkg.cmds.length - 1].uniqueId!], null, 2), this.pkg.stackName)
        const resPath = path.join(this.path, 'stack-resources.cenv');
        CenvLog.single.infoLog('writing stack resources to ' + resPath);
        if (this.pkg?.cmds && this.pkg?.cmds.length && opt.pkgCmd?.uniqueId && this.pkg?.cmds[opt.pkgCmd?.uniqueId] ) {
          writeFileSync(resPath, JSON.stringify(this.pkg.cdkProcesses[opt.pkgCmd?.uniqueId], null, 2));
          writeFileSync(this.pkg.path + '/stack-resources.cenv', JSON.stringify(this.pkg.cdkProcesses[opt.pkgCmd?.uniqueId], null, 2));
        }

        if (opt.invalidation) {
          await createInvalidation(opt.invalidation, 100);
        }
      }
    }

    await runScripts(this, this.meta.postDeployScripts);

    if (this.pkg.component && !this.pkg.instance) {
      await ParamsModule.upsertComponentRef(this.pkg);
    }
    //deployCmd.result(0);
  }

  async resetVolatileKeys(opt: string) {
    if (this.meta?.cenv?.stack?.clearContext) {
      /*await Promise.allSettled(this.pkg.meta.data.cenv.stack.volatileContextKeys.map(async (key) => {
        key = key.replace('CDK_DEFAULT_ACCOUNT', process.env.CDK_DEFAULT_ACCOUNT);
        key = key.replace('CDK_DEFAULT_REGION', process.env.CDK_DEFAULT_REGION);
        key = key.replace('ENV', CenvFiles.ENVIRONMENT);
        await this.pkg.pkgCmd(`cdk context --reset ${key}`, { ...opt, pkgPath: this.path, failOnError: false });
      }));*/
      await this.pkg.pkgCmd('cdk context --clear', { pkgPath: this.path });
    }
  }

  getCdkOut() {
    let cdkOutPath = this.path;
    if (this.pkg.component) {
      const instance = this.pkg.instance;
      cdkOutPath = `${CenvFiles.getMonoRoot()}/packages/${instance ? instance + '/' : ''}${this.pkg.component}`;
    }
    return `${cdkOutPath}/env.cdk.out/${CenvFiles.ENVIRONMENT}/cdk.out`;
  }

  async getOptions(opt: any, processType: ProcessMode) {
    try {
      if (this.pkg?.params) {
        if (!this.pkg?.params?.varsLoaded) {
          await this.pkg.params.loadVars();
        }
        opt.cenvVars = { ...opt.cenvVars, ...this.pkg.params.cenvVars };
      }

      if (this.meta?.cenv?.stack?.package || this.pkg.component) {
        const componentPackage = this.meta.cenv?.stack?.package || this.pkg.codifiedName;
        opt.pkgPath = CenvFiles.stackPath(componentPackage);

        const componentPackageParts = Package.getPackageComponent(componentPackage);
        if (componentPackageParts.component === 'spa') {
          opt.cenvVars = { CENV_BUCKET_NAME: this.pkg.bucketName, ...opt.cenvVars };
          opt.invalidate = this.getOutput('DistributionId');
        }
        if (this.meta?.cenv?.stack?.buildPath || this.meta?.cenv?.stackTemplatePath) {
          opt.cenvVars = { CENV_BUILD_PATH: path.join(this.path, this.meta?.cenv?.stack?.buildPath || this.meta.cenv.stackTemplatePath!), ...opt.cenvVars };
        }
        if (this.pkg.instance && !opt.cenvVars.APP) {
          opt.cenvVars.APP = this.pkg.instance;
        }
      } else {
        opt.packageModule = this.pkg.stack;
      }

      const pkgVars = {
        CENV_PKG_VERSION: this.pkg.rollupVersion,
        CENV_STACK_NAME: removeScope(this.pkg.packageName),
        CENV_APPLICATION_NAME: this.pkg.packageName
      };
      opt.cenvVars = { ...opt.cenvVars, ...pkgVars };
      if (this.pkg.docker) {
        /*const latestImage = await getTag(this.pkg.docker.dockerName, 'latest');
        if (!latestImage) {
          throw new Error(`the repository "${this.pkg.docker.dockerName}" does not have an image with the tag latest`);
        }

         */
        opt.cenvVars.CENV_PKG_DIGEST = this.pkg.docker.digest || this.pkg.docker.latestImage?.imageDigest;
        opt.cenvVars.CENV_DOCKER_NAME = this.pkg.docker.dockerName || this.meta?.cenv?.docker?.name;
      } else if (this.meta?.cenv?.docker?.name) {
        opt.cenvVars.CENV_DOCKER_NAME = this.meta?.cenv?.docker?.name;
      }
      if (this.meta?.cenv?.stack?.assignedSubDomain) {
        opt.cenvVars['CENV_SUBDOMAIN'] = this.meta.cenv.stack.assignedSubDomain;
      }

      opt.redirectStdErrToStdOut = true;
      this.getCommandEvents(opt, processType);
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
    return opt;
  }

  async updateBucket() {
    try {

      await this.pkg.params?.loadVars();
      await this.checkStatus();
      const bucketName = `${process.env.ENV}${this.pkg.params?.materializedVars?.APP}Bucket`;
      console.log('bucketName', bucketName);
      const bucket = this.getOutput(bucketName);
      if (!bucket || !bucket.OutputValue) {
        CenvLog.single.errorLog(`the stack ${this.pkg.stackName} does not have an output named ${bucketName}`);
        return;
      }

      const dataPath = this.meta?.cenv?.stack?.buildPath ? path.join(this.path, this.meta.cenv.stack.buildPath) : this.path;

      CenvLog.single.infoLog(`syncing ${dataPath} to s3://${bucket.OutputValue}`)
      const syncRes = await s3sync(dataPath, bucket.OutputValue);
      if (syncRes) {
        this.info(`synchronization complete`, JSON.stringify(syncRes, null, 2));

      } else {
        CenvLog.single.infoLog(`synchronization failed`)
      }
    } catch (e) {
      CenvLog.single.errorLog(e);
    }
  }

  getCommandEvents(opt: any, processType: ProcessMode) {
    if (processType === ProcessMode.DESTROY) {
      opt.commandEvents = {
        failureCommandFunc: async () => {
          this.alert('the cdk destroy function failed.. attempting to destroy the cloudformation stack via api instead');
          await deleteStack(this.pkg.stackName, true, true);
          this.std('success', 'destroy cloudformation stack');
        }
      }
    }
  }

  reset() {
    this.verified = false;
    this.summary = undefined;
    this.stackVersion = undefined;
    this.detail = undefined;
    this.checked = false;
    this.status = { needsFix: [], deployed: [], incomplete: [] };
  }

  statusIssues() {
    this.verbose(`verified: [${this?.verified}] hasDetail: [${!!this?.detail}] hasLatestDeployedVersion: [${this?.hasLatestDeployedVersion}] hasLatestDeployedDigest: [${this.hasLatestDeployedDigest}] latestDigest: [${this.pkg?.docker?.latestDigest}] deployedDigest: [${this?.deployedDigest}]`, 'deploy status debug');
  }

  printCheckStatusComplete(silent = false): void {
    if (this.detail && !silent) {
      this.info(JSON.stringify(this.detail, null, 2), 'stack detail');
    }
    this.checked = true;
    this.getDetails();
  }

  async checkStatus(silent = false) {
    if (!this.pkg || this.pkg.stackName === '') {
      this.checked = true;
      return;
    }
    this.printCheckStatusStart();

    if (this.pkg) {
      if (this.pkg?.meta?.data.verifyStack) {
        const verifyRes = await this.pkg.pkgCmd(this.pkg.meta?.data.verifyStack, { returnOutput: true, silent: true });
        this.verified = verifyRes.result === 0;
        this.printCheckStatusComplete(silent);
        return;
      }
    }

    const stackRegion = this.pkg?.params?.localVars ? this.pkg.params.localVars['STACK_REGION'] : undefined;
    const stacks = await describeStacks(this.pkg.stackNameFinal, true, stackRegion);
    if (stacks && stacks.length) {
      this.detail = stacks[0];
      const versionTag = this.getTag(`CENV_PKG_VERSION`, this.pkg.stackName);

      if (versionTag) {
        this.stackVersion = semVerParse(versionTag);
      }

      if (this.detail?.Outputs) {
        this.detail?.Outputs.map((o) => {
          if (o.OutputKey && o.OutputValue) {
            if (o.OutputKey === 'Site') {
              this.pkg.primaryLink = o.OutputValue;
            } else if (o.OutputKey?.startsWith('FargateServiceUrl')) {
              this.pkg.primaryLink = o.OutputValue;
            }
            this.pkg.links.push(o.OutputValue);
          }
        });
      }
    }

    if (this.deployedDigest) {
      this.pkg.links.push(`ECR (deployed image) https://${process.env.AWS_REGION}.console.aws.amazon.com/ecr/repositories/private/${process.env.CDK_DEFAULT_ACCOUNT}/${this.name}e/_/image/${this.deployedDigest}/details?region=${process.env.AWS_REGION}`);
    }

    this.printCheckStatusComplete(silent);
  }

  upToDate(): boolean {
    return this.verified || (!!this.detail && this.hasLatestDeployedVersion && (!this.pkg?.docker || this.hasLatestDeployedDigest) && this.getStackComplete());
  }

  getStackStatus(): string {
    return this.detail?.StackStatus ? this.detail.StackStatus : 'UNKNOWN';
  }

  getStackComplete(): boolean {
    if (!this.detail?.StackStatus) {
      return false;
    }
    switch (this.detail.StackStatus) {
      case 'CREATE_COMPLETE':
      case 'UPDATE_COMPLETE':
      case 'IMPORT_COMPLETE':
      case 'IMPORT_ROLLBACK_COMPLETE':
      case 'UPDATE_ROLLBACK_COMPLETE':
        return true;
      case 'ROLLBACK_COMPLETE':
        return false;
    }
    return false;
  }

  needsAutoDelete() {
    return this.getStackStatus() === 'ROLLBACK_COMPLETE';
  }

  getDetails() {
    if (this.verified) {
      this.status.deployed.push(this.statusLine('up to date', `verified using package.json's verifyStack cmd [${this.meta.verifyStack}]`, false));
      return;
    }
    if (this.upToDate()) {
      if (this.pkg.docker) {
        this.status.deployed.push(this.statusLine('up to date', `latest version [${this.pkg.rollupVersion.toString()}] deployed with digest [${this.pkg.docker.latestDigestShort}]`, false));
        return;
      } else {
        this.status.deployed.push(this.statusLine('up to date', `latest version [${this.pkg.rollupVersion.toString()}] deployed`, false));
        return;
      }
    }

    if (!this.detail) {
      this.status.incomplete.push(this.statusLine('not deployed', `the stack [${this.pkg.stackName}] has not been deployed`, true));
      return;
    } else {
      if (!this.getStackComplete()) {
        if (this.getStackStatus() === 'ROLLBACK_COMPLETE') {
          this.status.incomplete.push(this.statusLine('rollback complete', `a deployment failed and the shell of the stack that is left will be deleted automatically during the next deploy`, true));
        } else {
          this.status.incomplete.push(this.statusLine('stack in progress', `the stack's current status is [${this.detail.StackStatus}] .`, true));
        }
      }
      if (!this.stackVersion) {
        this.status.incomplete.push(this.statusLine('not fully deployed', `the stack [${CenvLog.colors.errorBold(this.pkg.stackName)}] exists in environment ${CenvFiles.ENVIRONMENT} but has not been tagged with a CENV_PKG_VERSION`, true));
      } else if (parse(this.stackVersion) !== this.pkg.rollupVersion) {
        this.status.incomplete.push(this.versionMismatch(this.stackVersion.toString()));
      }
    }

    if (this.pkg.docker) {
      if (!this.pkg.docker.latestImage) {
        this.status.incomplete.push(this.statusLine('docker missing', `no docker image found in repo ${this.pkg.docker?.dockerName}`, true));
      }
      if (!this.hasLatestDeployedDigest && this.pkg?.docker) {
        this.status.incomplete.push(this.statusLine('incorrect digest', `latest digest [${this.pkg?.docker.latestDigestShort}] deployed digest [${this.deployedDigestShort}]`, true));
      }
    }
  }

  getTag(tag: string, stackName: string): string | false {
    if (!this.detail) {
      return false;
    }
    return StackModule.getTag(this.detail, tag);
  }

  static getTag(stackDetail: Stack, tag: string) {
    const tags = stackDetail?.Tags?.filter((t) => t.Key === tag);
    return tags?.length && tags[0].Value ? tags[0].Value : false;
  }

  getOutput(key: string) {
    if (!this.detail || !this.detail.Outputs) {
      return false;
    }
    const outputs = this.detail.Outputs.filter((output: any) => output.OutputKey === key);
    if (outputs.length) {
      return outputs[0];
    }
    return false;
  }

  getUrls() {
    switch (this.stackType) {
      case StackType.ECS:
        return this.getEcsUrls();
      case StackType.LAMBDA:
        return this.getLambdaUrl();
      case StackType.ACM:
        return this.getAcmUrl();
      case StackType.NETWORK:
        return this.getNetworkUrl();
    }
    return false;
  }

  getNetworkUrl() {
    let url = 'https://AWS_REGION.console.aws.amazon.com/vpc/home?region=AWS_REGION#VpcDetails:VpcId=VPC_ID';
    url = this.updateRegion(url);

    const id = this.getOutput(`${CenvFiles.ENVIRONMENT}-network-id`);
    if (!id || !id.OutputValue) {
      return false;
    }
    return url.replace(/VPC_ID/g, id.OutputValue);
  }

  getLambdaUrl() {
    const functionName = `${CenvFiles.ENVIRONMENT}-${this.pkg.packageName}-fn}`;
    let url = 'https://AWS_REGION.console.aws.amazon.com/lambda/home?region=AWS_REGION#/functions/FUNCTION_NAME';
    url = this.updateRegion(url);
    return url.replace(/FUNCTION_NAME/g, functionName);
  }

  getAcmUrl() {
    let url = 'https://AWS_REGION.console.aws.amazon.com/acm/home?region=AWS_REGION#/certificates/ARN_GUID';
    url = this.updateRegion(url);

    const arn = this.getOutput('CertificateArn');
    if (!arn || !arn.OutputValue) {
      return false;
    }
    return url.replace(/ARN_GUID/g, arn.OutputValue.split('/').pop() as string);
  }

  getEcsUrls() {
    const cluster: NameReplacer = {
      name: `${CenvFiles.ENVIRONMENT}-${removeScope(this.pkg.packageName)}-cluster`, regex: /CLUSTER_NAME/g,
    };
    const service: NameReplacer = {
      name: `${CenvFiles.ENVIRONMENT}-${this?.meta?.cenv?.stack?.assignedSubDomain ? this?.meta?.cenv?.stack?.assignedSubDomain + '-' : ''}svc`,
      regex: /ECS_SERVICE/g,
    };
    const urls: string[] = [];
    urls.push(this.getEcsClusterUrl(cluster));
    urls.push(this.getEcsServiceUrl(cluster, service));
    urls.push(this.getEcsTaskUrl(cluster, service));
    return urls;
  }

  getEcsClusterUrl(cluster: NameReplacer) {
    let url = 'https://AWS_REGION.console.aws.amazon.com/ecs/v2/clusters/CLUSTER_NAME/services?region=AWS_REGION';
    url = this.updateRegion(url);
    return url.replace(cluster.regex, cluster.name);
  }

  getEcsServiceUrl(cluster: NameReplacer, service: NameReplacer) {
    let url = 'https://AWS_REGION.console.aws.amazon.com/ecs/v2/clusters/ECS_CLUSTER/services/ECS_SERVICE/';
    url = this.updateRegion(url);
    return url.replace(cluster.regex, cluster.name);
  }

  getEcsTaskUrl(cluster: NameReplacer, service: NameReplacer) {
    return this.getEcsServiceUrl(cluster, service) + 'tasks?region=us-east-1';
  }

  getSpaUrls() {

    const urls: string[] = [];

    // cloudfront
    const distroId = this.getOutput(`DistributionId`);
    if (distroId) {
      const distro: NameReplacer = {
        name: distroId.OutputValue as string, regex: /DISTRIBUTION_ID/g,
      };
      urls.push(this.getCloudFrontDistroUrl(distro));
    }

    // s3
    const bucketOutput = this.getOutput(`Bucket`);
    if (bucketOutput) {
      const bucket: NameReplacer = {
        name: bucketOutput.OutputValue as string, regex: /BUCKET_NAME/g,
      };
      urls.push(this.getBucketUrl(bucket));
    }

    // acm
    const res = this.getAcmUrl();
    if (res) {
      urls.push(res);
    }

    // route53
    return urls;
  }

  getBucketUrl(bucket: NameReplacer) {
    let url = 'https://s3.console.aws.amazon.com/s3/buckets/BUCKET_NAME?region=AWS_REGION&tab=objects';
    url = this.updateRegion(url);
    return url.replace(bucket.regex, bucket.name);
  }

  getCloudFrontDistroUrl(cluster: NameReplacer) {
    let url = `https://AWS_REGION.console.aws.amazon.com/cloudfront/v3/home?region=AWS_REGION#/distributions/DISTRIBUTION_ID`;
    url = this.updateRegion(url);
    return url.replace(cluster.regex, cluster.name);
  }

  updateRegion(urlTemplate: string) {
    return urlTemplate.replace(/AWS_REGION/g, process.env.AWS_REGION!);
  }

}
