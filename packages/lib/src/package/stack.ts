import {IPackageModule, PackageModule, PackageModuleType, ProcessMode} from './module';
import {Stack, StackSummary} from '@aws-sdk/client-cloudformation';
import {deleteStack, describeStacks} from '../aws/cloudformation';
import semver, {SemVer} from 'semver';
import {CenvLog, colors} from '../log';
import {getMonoRoot, removeScope, runScripts, spawnCmd, stackPath} from "../utils";
import {CommandEvents, Package, PackageCmd} from "./package";
import path from "path";

export enum StackType {
  ECS = 'ECS', LAMBDA = 'LAMBDA', ACM = 'ACM', SPA = 'SPA', NETWORK = 'NETWORK'
}

interface NameReplacer {
  name: string;
  regex: RegExp;
}

export class StackModule extends PackageModule {
  detail?: Stack;
  verified? = false;
  summary?: StackSummary;
  stackVersion?: SemVer;
  stackType?: StackType;

  constructor(module: IPackageModule) {
    super(module, PackageModuleType.STACK);
    this.stackType = this.pkg.fullType === 'services' ? StackType.ECS : StackType.LAMBDA;
  }

  public static get localEnv(): boolean {
    return process.env.ENV! === 'local';
  }

  public static get cdkExe(): string {
    return this.localEnv ? 'cdklocal' : 'cdk';
  }
  static commands = [`${this.cdkExe} deploy --require-approval never --no-color -m direct`, `${this.cdkExe} destroy --force --no-color`, `${this.cdkExe} synth`,];

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
    return this.getTag('CENV_PKG_DIGEST');
  }

  get deployedDigestShort(): string | false {
    const digestTag = this.getTag('CENV_PKG_DIGEST');
    if (!digestTag) {
      return false;
    }
    return digestTag.substring(digestTag.length - 8);
  }

  get hasLatestDeployedVersion(): boolean {
    if (this?.stackVersion === undefined) {
      return;
    }
    return (this.pkg.rollupVersion?.toString() === semver.parse(this?.stackVersion)?.toString());
  }

  get hasLatestDeployedDigest(): boolean {
    if (!this.pkg?.stack) {
      return true;
    }
    if (this?.deployedDigest === false) {
      return;
    }
    return this.pkg?.docker.latestDigest === this?.deployedDigest && !!this.pkg?.docker.latestDigest;
  }

  static fromModule(module: PackageModule) {
    return new StackModule(module);
  }

  async destroy(packageCmd?: PackageCmd) {
    let actualCommand = StackModule.commands[Object.keys(ProcessMode).indexOf(ProcessMode.DESTROY)];
    actualCommand += ` -o ${this.getCdkOut()}`

    let opt: any = {cenvVars: {}};
    opt = await this.getOptions(opt, ProcessMode.DESTROY);
    opt.parentCmd = packageCmd;
    await this.pkg.pkgCmd(actualCommand, opt);
  }

  async synth() {
    let actualCommand = StackModule.commands[Object.keys(ProcessMode).indexOf(ProcessMode.SYNTH)];
    actualCommand += ` -o ${this.getCdkOut()}`

    const opt: any = await this.getOptions({cenvVars: {}}, ProcessMode.DESTROY);
    await this.pkg.pkgCmd(actualCommand, opt);
  }

  async deploy(deployOptions: any, options: any) {

    const deployCmd = this.pkg.createCmd(`cenv deploy ${this.pkg.packageName} --stack`);

    if (this.needsAutoDelete()) {
      await this.destroy(deployCmd);
    }

    await runScripts(this, this.pkg.meta.data.postDeployScripts);

    if (!process.env.CENV_SKIP_CDK) {

      const opt = await this.getOptions(deployOptions, ProcessMode.DEPLOY);
      opt.parentCmd = deployCmd;
      await this.resetVolatileKeys(opt)

      if (this.meta.deployStack) {
        return await this.pkg.pkgCmd(this.meta.deployStack, opt);
      }

      let deployCommand = StackModule.commands[Object.keys(ProcessMode).indexOf(ProcessMode.DEPLOY)];
      if (deployOptions.force) {
        deployCommand += ' --force';
      }
      deployCommand += ` -o ${this.getCdkOut()}`

      await this.pkg.pkgCmd(deployCommand, opt);
    }

    await runScripts(this, this.pkg.meta.data.postDeployScripts);

    if (this?.pkg.meta?.data.postDeployScripts) {
      for (let i = 0; i < this.pkg.meta.data.postDeployScripts.length; i++) {
        const script = this.pkg.meta.data.postDeployScripts[i];
        await spawnCmd(this.pkg.params.path, script, script, {...options, redirectStdErrToStdOut: true}, this.pkg);
      }
    }
    deployCmd.result(0);
  }

  async resetVolatileKeys(opt) {
    if (this.pkg.meta.data?.cenv?.stack?.clearContext) {
      /*await Promise.allSettled(this.pkg.meta.data.cenv.stack.volatileContextKeys.map(async (key) => {
        key = key.replace('CDK_DEFAULT_ACCOUNT', process.env.CDK_DEFAULT_ACCOUNT);
        key = key.replace('CDK_DEFAULT_REGION', process.env.CDK_DEFAULT_REGION);
        key = key.replace('ENV', process.env.ENV);
        await this.pkg.pkgCmd(`cdk context --reset ${key}`, { ...opt, pkgPath: this.path, failOnError: false });
      }));*/
      await this.pkg.pkgCmd('cdk context --clear', {pkgPath: this.path});
    }
  }

  getCdkOut() {
    let cdkOutPath = this.path;
    if (this.pkg.component) {
      cdkOutPath = getMonoRoot() + '/packages/' + this.pkg.component;
    }
    return cdkOutPath + '/cdk.out'
  }

  async getOptions(opt: any, processType: ProcessMode) {
    try {
      if (this.pkg?.params) {
        if (!this.pkg?.params?.varsLoaded) {
          await this.pkg.params.loadVars();
        }
        opt.cenvVars = {...this.pkg.params.cenvVars, ...opt.cenvVars};
      }

      if (this.meta?.cenv?.stack?.package || this.pkg.component) {
        const componentPackage = this.meta.cenv?.stack?.package || this.pkg.codifiedName
        opt.pkgPath = stackPath(`${componentPackage}`);

        const componentPackageParts = Package.getPackageComponent(componentPackage);
        if (componentPackageParts.component === 'spa') {
          opt.cenvVars = {CENV_BUCKET_NAME: this.pkg.bucketName, ...opt.cenvVars};
        }
        if (this.meta?.cenv?.stack?.buildPath) {
          opt.cenvVars = {CENV_BUILD_PATH: path.join(this.path, this.meta?.cenv?.stack.buildPath), ...opt.cenvVars};
        }
      } else {
        opt.packageModule = this.pkg.stack;
      }

      const pkgVars = {
        CENV_PKG_VERSION: this.pkg.rollupVersion, CENV_STACK_NAME: removeScope(this.pkg.packageName)
      }
      opt.cenvVars = {...opt.cenvVars, ...pkgVars};
      if (this.pkg.docker) {
        /*const latestImage = await getTag(this.pkg.docker.dockerName, 'latest');
        if (!latestImage) {
          throw new Error(`the repository "${this.pkg.docker.dockerName}" does not have an image with the tag latest`);
        }

         */
        opt.cenvVars.CENV_PKG_DIGEST = this.pkg.docker.latestImage?.imageDigest;
        opt.cenvVars.CENV_DOCKER_NAME = this.pkg.docker.dockerName;
      }
      if (this.meta?.cenv?.stack?.assignedSubDomain) {
        opt.cenvVars['CENV_SUBDOMAIN'] = this.meta.cenv.stack.assignedSubDomain
      }

      opt.redirectStdErrToStdOut = true;
      opt.commandEvents = this.getCommandEvents(opt, processType)
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
    return opt;
  }

  getCommandEvents(opt, processType: ProcessMode): CommandEvents {
    const commandEvents: CommandEvents = {
      preCommandFunc: async () => {
        this.info(opt.cenvVars.CENV_PKG_VERSION, 'CENV_PKG_VERSION');
        this.info(opt.cenvVars.CENV_STACK_NAME, 'CENV_STACK_NAME');
        if (this.pkg.docker) {
          this.info(opt.cenvVars.CENV_PKG_DIGEST, 'CENV_PKG_DIGEST');
          this.info(opt.cenvVars.CENV_DOCKER_NAME, 'CENV_DOCKER_NAME');
        }
      }
    }
    if (processType === ProcessMode.DESTROY) {
      commandEvents.failureCommandFunc = async () => {
        this.alert('the cdk destroy function failed.. attempting to destroy the cloudformation stack via api instead');
        await deleteStack(this.pkg.stackName, true, true);
        this.std('success', 'destroy cloudformation stack');
      };
    }
    return commandEvents;
  }

  reset() {
    this.verified = undefined;
    this.summary = undefined;
    this.stackVersion = undefined;
    this.detail = undefined;
    this.checked = false;
    this.status = {needsFix: [], deployed: [], incomplete: []};
  }

  statusIssues() {
    this.verbose(`verified: [${this?.verified}] hasDetail: [${!!this?.detail}] hasLatestDeployedVersion: [${this?.hasLatestDeployedVersion}] hasLatestDeployedDigest: [${this.hasLatestDeployedDigest}] latestDigest: [${this.pkg?.docker?.latestDigest}] deployedDigest: [${this?.deployedDigest}]`, 'deploy status debug');
  }

  printCheckStatusComplete(): void {
    if (this.detail) {
      this.info(JSON.stringify(this.detail, null, 2), 'stack detail');
    }
    this.checked = true;
    this.getDetails();
  }

  async checkStatus() {
    if (!this.pkg || this.pkg.stackName === '') {
      this.checked = true;
      return;
    }
    this.printCheckStatusStart();

    if (this.pkg) {
      if (this.pkg?.meta?.data.verifyStack) {
        const verifyRes = await this.pkg.pkgCmd(this.pkg.meta?.data.verifyStack, {returnOutput: true, silent: true});
        this.verified = verifyRes.result === 0;
        this.printCheckStatusComplete();
        return;
      }
    }

    const stacks: Stack[] = await describeStacks(this.pkg.stackNameFinal, true);
    if (stacks && stacks.length) {
      this.detail = stacks[0];
      const versionTag = this.getTag(`CENV_PKG_VERSION`);

      if (versionTag) {
        this.stackVersion = semver.parse(versionTag);
      }

      if (this.detail?.Outputs) {
        this.detail?.Outputs.map((o) => {
          if (o.OutputKey === 'Site') {
            this.pkg.primaryLink = o.OutputValue;
          } else if (o.OutputKey.startsWith('FargateServiceUrl')) {
            this.pkg.primaryLink = o.OutputValue;
          }
          this.pkg.links.push(o.OutputValue);
        });
      }
    }

    if (this.deployedDigest) {
      this.pkg.links.push(`ECR (deployed image) https://${process.env.AWS_REGION}.console.aws.amazon.com/ecr/repositories/private/${process.env.CDK_DEFAULT_ACCOUNT}/${this.name}e/_/image/${this.deployedDigest}/details?region=${process.env.AWS_REGION}`,);
    }

    this.printCheckStatusComplete();
  }

  upToDate(): boolean {
    return this.verified || (this.detail && this.hasLatestDeployedVersion && (!this.pkg?.docker || this.hasLatestDeployedDigest) && this.getStackComplete());
  }

  getStackStatus(): string {
    return this.detail?.StackStatus;
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
      this.status.deployed.push(this.statusLine('up to date', `verified using package.json's verifyStack cmd [${this.pkg.meta.data.verifyStack}]`, false));
      return;
    }
    if (this.upToDate()) {
      if (this.pkg.docker) {
        this.status.deployed.push(this.statusLine('up to date', `latest version [${this.pkg.rollupVersion.toString()}] deployed with digest [${this.pkg.docker.latestDigestShort}]`, false,));
        return;
      } else {
        this.status.deployed.push(this.statusLine('up to date', `latest version [${this.pkg.rollupVersion.toString()}] deployed`, false,));
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
        this.status.incomplete.push(this.statusLine('not fully deployed', `the stack [${colors.errorBold(this.pkg.stackName)}] exists in environment ${process.env.ENV} but has not been tagged with a CENV_PKG_VERSION`, true));
      } else if (semver.parse(this.stackVersion) !== this.pkg.rollupVersion) {
        this.status.incomplete.push(this.versionMismatch(this.stackVersion.toString()));
      }
    }

    if (this.pkg.docker) {
      if (!this.pkg.docker.latestImage) {
        this.status.incomplete.push(this.statusLine('docker missing', `no docker image found in repo ${this.pkg.docker?.dockerName}`, true,));
      }
      if (!this.hasLatestDeployedDigest && this.pkg?.docker) {
        this.status.incomplete.push(this.statusLine("incorrect digest", `latest digest [${this.pkg?.docker.latestDigestShort}] deployed digest [${this.deployedDigestShort}]`, true,));
      }
    }
  }

  getTag(tag: string, stackName: string = undefined): string | false {
    if (stackName) {
      const pkg = Package.fromStackName(stackName)
      if (!pkg || !pkg.stack) {
        return;
      }
      return pkg.stack.getTag('VPCID')
    }

    const tags = this.detail?.Tags?.filter((t) => t.Key === tag)
    return tags?.length ? tags[0].Value : false;
  }

  getOutput(key) {
    const outputs = this.detail?.Outputs.filter((output: any) => output.OutputKey === key);
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
  }

  getNetworkUrl() {
    let url = "https://AWS_REGION.console.aws.amazon.com/vpc/home?region=AWS_REGION#VpcDetails:VpcId=VPC_ID";
    url = this.updateRegion(url);

    const id = this.getOutput(`${process.env.ENV}-network-id`);
    if (!id) {
      return false;
    }
    return url.replace(/VPC_ID/g, id.OutputValue);
  }

  getLambdaUrl() {
    const functionName = `${process.env.ENV}-${this.pkg.name}-fn}`;
    let url = "https://AWS_REGION.console.aws.amazon.com/lambda/home?region=AWS_REGION#/functions/FUNCTION_NAME";
    url = this.updateRegion(url);
    return url.replace(/FUNCTION_NAME/g, functionName);
  }

  getAcmUrl() {
    let url = "https://AWS_REGION.console.aws.amazon.com/acm/home?region=AWS_REGION#/certificates/ARN_GUID";
    url = this.updateRegion(url);

    const arn = this.getOutput('CertificateArn');
    if (!arn) {
      return false;
    }
    return url.replace(/ARN_GUID/g, arn.OutputValue.split('/').pop());
  }

  getEcsUrls() {
    const cluster: NameReplacer = {
      name: `${process.env.ENV}-${removeScope(this.pkg.packageName)}-cluster`, regex: /CLUSTER_NAME/g
    }
    const service: NameReplacer = {
      name: `${process.env.ENV}-${this?.meta?.cenv?.stack?.assignedSubDomain ? this?.meta?.cenv?.stack?.assignedSubDomain + '-' : ''}svc`,
      regex: /ECS_SERVICE/g
    }
    const urls = [];
    urls.push(this.getEcsClusterUrl(cluster));
    urls.push(this.getEcsServiceUrl(cluster, service));
    urls.push(this.getEcsTaskUrl(cluster, service));
    return urls;
  }

  getEcsClusterUrl(cluster: NameReplacer) {
    let url = "https://AWS_REGION.console.aws.amazon.com/ecs/v2/clusters/CLUSTER_NAME/services?region=AWS_REGION";
    url = this.updateRegion(url);
    return url.replace(cluster.regex, cluster.name);
  }

  getEcsServiceUrl(cluster: NameReplacer, service: NameReplacer) {
    let url = "https://AWS_REGION.console.aws.amazon.com/ecs/v2/clusters/ECS_CLUSTER/services/ECS_SERVICE/";
    url = this.updateRegion(url);
    return url.replace(cluster.regex, cluster.name);
  }

  getEcsTaskUrl(cluster: NameReplacer, service: NameReplacer) {
    return this.getEcsServiceUrl(cluster, service) + "tasks?region=us-east-1";
  }

  getSpaUrls() {

    const urls = [];

    // cloudfront
    const distroId = this.getOutput(`DistributionId`);
    if (distroId) {
      const distro: NameReplacer = {
        name: distroId.OutputValue, regex: /DISTRIBUTION_ID/g
      }
      urls.push(this.getCloudFrontDistroUrl(distro));
    }

    // s3
    const bucketOutput = this.getOutput(`Bucket`);
    if (bucketOutput) {
      const bucket: NameReplacer = {
        name: bucketOutput.OutputValue, regex: /BUCKET_NAME/g
      }
      urls.push(this.getBucketUrl(bucket));
    }

    // acm
    urls.push(this.getAcmUrl());

    // route53
    return urls;
  }

  getBucketUrl(bucket) {
    let url = "https://s3.console.aws.amazon.com/s3/buckets/BUCKET_NAME?region=AWS_REGION&tab=objects"
    url = this.updateRegion(url);
    return url.replace(bucket.regex, bucket.name);
  }

  getCloudFrontDistroUrl(cluster: NameReplacer) {
    let url = `https://AWS_REGION.console.aws.amazon.com/cloudfront/v3/home?region=AWS_REGION#/distributions/DISTRIBUTION_ID`
    url = this.updateRegion(url);
    return url.replace(cluster.regex, cluster.name);
  }

  getEcsSpaUrl() {
    let url = `https://AWS_REGION.console.aws.amazon.com/cloudfront/v3/home?region=AWS_REGION#/distributions/DISTRIBUTION_ID`
  }

  updateRegion(urlTemplate) {
    return urlTemplate.replace(/AWS_REGION/g, process.env.AWS_REGION);
  }

}
