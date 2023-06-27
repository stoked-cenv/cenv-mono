import {IPackageModule, PackageModule, PackageModuleType, ProcessMode} from './module';
import { Stack, StackSummary } from '@aws-sdk/client-cloudformation';
import { describeStacks } from '../aws/cloudformation';
import semver, { SemVer } from 'semver';
import { colors } from '../log';
import {join} from "path";
import {CenvFiles} from "../file";
import {spawnCmd} from "../utils";

export enum DeployType {
  ECS = 'ECS',
  LAMBDA = 'LAMBDA'
}





export class StackModule extends PackageModule {
  detail?: Stack;
  verified? = false;
  summary?: StackSummary;
  stackVersion?: SemVer;
  deployType?: DeployType;

  public static get localEnv(): boolean { return process.env.ENV! === 'local'; }
  public static get cdkExe(): string { return this.localEnv ? 'cdklocal' : 'cdk'; }

  static commands = [
    `${this.cdkExe} deploy --require-approval never --no-color -m direct`,
    `${this.cdkExe} destroy --force --no-color`,
  ];

  constructor(module: IPackageModule) {
    super(module, PackageModuleType.STACK);
    this.deployType = this.pkg.fullType === 'services' ? DeployType.ECS : DeployType.LAMBDA;
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
    return (
      this.verified || !!this.detail || !!this.deployedDigest || !!this.deployedVersion
    );
  }

  async delete() {
    const actualCommand = StackModule.commands[ProcessMode.DESTROY];
    await spawnCmd(this.pkg.stack.path, actualCommand, `${actualCommand} ${this.pkg.stackName}`, { redirectStdErrToStdOut: true }, this.pkg);

    const cleanCmd = `cenv clean ${this.pkg.packageName} --mode cdk`;
    await spawnCmd(this.path, cleanCmd, cleanCmd,{}, this.pkg);
  }

  reset() {
    this.verified = undefined;
    this.summary = undefined;
    this.stackVersion = undefined;
    this.detail = undefined;
    this.checked = false;
    this.status = { needsFix: [], deployed: [], incomplete: [] };
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
      if (this.pkg?.meta?.verifyStack) {
        const verifyRes = await this.pkg.pkgCmd(this.pkg.meta?.verifyStack, { returnOutput: true, silent: true });
        this.verified = verifyRes.result === 0;
        this.printCheckStatusComplete();
        return;
      }
    }

    const stacks: Stack[] = await describeStacks(this.pkg.stackName, true);
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
      this.pkg.links.push(
        `ECR (deployed image) https://${process.env.AWS_REGION}.console.aws.amazon.com/ecr/repositories/private/${process.env.CDK_DEFAULT_ACCOUNT}/${this.name}e/_/image/${this.deployedDigest}/details?region=${process.env.AWS_REGION}`,
      );
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
    switch(this.detail.StackStatus) {
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
      this.status.deployed.push( this.statusLine(
        'up to date',
        `verified using package.json\'s verifyStack cmd [${this.pkg.meta.verifyStack}]`,
        false,
      ));
      return;
    }
    if (this.upToDate()) {
      if (this.pkg.docker) {
        this.status.deployed.push(this.statusLine(
          'up to date',
          `latest version [${this.pkg.rollupVersion.toString()}] deployed with digest [${this.pkg.docker.latestDigestShort}]`,
          false,
        ));
        return;
      } else {
        this.status.deployed.push(this.statusLine(
          'up to date',
          `latest version [${this.pkg.rollupVersion.toString()}] deployed`,
          false,
        ));
        return;
      }
    }

    if (!this.detail) {
      this.status.incomplete.push( this.statusLine(
        'not deployed',
        `the stack [${this.pkg.stackName}] has not been deployed`,
        true,
      ));
      return;
    } else {
      if (!this.getStackComplete()) {
        if (this.getStackStatus() === 'ROLLBACK_COMPLETE') {
          this.status.incomplete.push(this.statusLine('rollback complete',
            `a deployment failed and the shell of the stack that is left will be deleted automatically during the next deploy`,
            true));
        } else {
          this.status.incomplete.push(this.statusLine('stack in progress',
            `the stack's current status is [${this.detail.StackStatus}]`,
            true));
        }
      }
      if (!this.deployedVersion) {
        this.status.incomplete.push(this.statusLine(
          'not fully deployed',
          `the stack [${colors.errorBold(this.pkg.stackName)}] exists in environment ${
            process.env.ENV
          } but has not been tagged with a CENV_PKG_VERSION`,
          true,
        ));
      } else if (semver.parse(this.deployedVersion) !== this.pkg.rollupVersion) {
        this.status.incomplete.push(this.versionMismatch(this.deployedVersion));
      }
    }

    if (this.pkg.docker) {
      if (!this.pkg.docker.latestImage) {
        this.status.incomplete.push(this.statusLine(
          'docker missing',
          `no docker image found in repo ${this.pkg.docker?.dockerName}`,
          true,
        ));
      }
      if (!this.hasLatestDeployedDigest && this.pkg?.docker) {
        this.status.incomplete.push(this.statusLine(
          "incorrect digest",
          `latest digest [${this.pkg?.docker.latestDigestShort}] deployed digest [${this.deployedDigestShort}]`,
          true,
        ));
      }
    }
  }

  static fromModule(module: PackageModule) {
    return new StackModule(module);
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

  getTag(tag): string | false {
    if (!this.checked) {
      return false;
    }
    const tags = this.detail?.Tags?.filter((t) => t.Key === tag)
    return tags?.length ? tags[0].Value : false;
  }

  get deployedVersion(): string | false {
    return this.getTag('CENV_PKG_VERSION');
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
    if (this?.deployedVersion === false) {
      return;
    }
    return (this.pkg.rollupVersion?.toString() === semver.parse(this?.deployedVersion)?.toString());
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
}
