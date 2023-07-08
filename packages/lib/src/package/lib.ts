import { EnvironmentStatus, Package, PackageCmd } from './package';
import { IPackageModule, PackageModule, PackageModuleType } from './module';
import { getRepository, listImages } from '../aws/ecr';
import { ImageIdentifier, Repository } from '@aws-sdk/client-ecr';
import semver from 'semver';
import {CenvLog, colors} from '../log';
export enum LibStatus {
  SUCCESS= 'SUCCESS',
  FAILED= 'FAILED',
  UNBUILT= 'UNBUILT'
}

export class LibModule extends PackageModule {
  buildStatus: LibStatus = LibStatus.UNBUILT;
  timestamp: Date;
  constructor(module: IPackageModule) {
    super(module, PackageModuleType.LIB);
  }

  upToDate(): boolean {
    return this.buildStatus === LibStatus.SUCCESS;
  }

  getDetails() {
    if (this.buildStatus === LibStatus.SUCCESS) {
      this.status.deployed.push(this.statusLine(
        'build succeeded',
        `build succeeded at [${this.timestamp.toLocaleString()}]`,
        false,
      ));
      return;
    } else if (this.buildStatus === LibStatus.FAILED) {
      this.status.needsFix.push(this.statusLine(
        'build failed',
        `build failed at [${this.timestamp.toLocaleString()}]`,
        true,
      ));
    } else {
      this.status.incomplete.push(this.statusLine(
        'unbuilt',
        `no attempt to build has been made yet`,
        true,
      ));
    }
  }

  get anythingDeployed(): boolean {
    return this.buildStatus === LibStatus.SUCCESS;
  }

  reset() {
    this.status = { needsFix: [], deployed: [], incomplete: [] };
    this.checked = false;
  }

  statusIssues() {
    this.verbose(`build status: [${this.buildStatus}] build timestamp: [${this.timestamp?.toLocaleString()}]`);
  }

  async build() {
    this.timestamp = new Date();
    this.buildStatus = await this.pkg.build(false, false) ? LibStatus.SUCCESS : LibStatus.FAILED;
  }

  printCheckStatusComplete(): void {
    this.getDetails();
    this.checked = true;

  }

  async checkStatus() {
    this.printCheckStatusStart();
    if (this.buildStatus === LibStatus.UNBUILT) {
      await this.build();
    }
    // no op
    this.printCheckStatusComplete();
  }

  static fromModule(module: PackageModule) {
    return new LibModule(module);
  }

  get moduleStrings(): string[] {
    const items = super.moduleBaseStrings;
    items.push(`build status: ${this.buildStatus}`);
    items.push(`build timestamp: ${this.timestamp}`);
    return items;
  }
}
