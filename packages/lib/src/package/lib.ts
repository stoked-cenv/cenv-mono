import { BuildCommandOptions, Package, ProcessStatus, TPackageMeta } from './package';
import { PackageModule, PackageModuleType } from './module';
import { CenvLog } from '../log';
import { Deployment } from '../deployment';
import { BumpMode, Version } from '../version';
import { computeMetaHash } from '../utils';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { CenvFiles } from '../file';
import { PackageCmd } from './package';
import { execCmd } from "../proc";
import { SemVer, parse } from "semver";

export enum LibStatus {
  SUCCESS = 'SUCCESS', FAILED = 'FAILED', UNBUILT = 'UNBUILT', PREVIOUSLY_BUILT = 'PREVIOUSLY_BUILT'
}

export class LibModule extends PackageModule {
  public static buildLog: any;
  public static buildLogPath: string;
  buildStatus: LibStatus = LibStatus.UNBUILT;
  timestamp?: Date;
  hasBeenBuilt = false;
  previousBuildTs?: Date;
  hasCheckedLogs = false;
  isPublishable = false;
  publishedVersion: SemVer | null = null;

  constructor(pkg: Package, path: string, meta: TPackageMeta) {
    super(pkg, path, meta, PackageModuleType.LIB);
    this.isPublishable = !!this.cenv('publish');
  }
  get anythingDeployed(): boolean {
    return this.buildStatus === LibStatus.SUCCESS || this.buildStatus === LibStatus.PREVIOUSLY_BUILT;
  }

  get moduleStrings(): string[] {
    const items = super.moduleBaseStrings;
    items.push(`build status: ${this.buildStatus}`);
    items.push(`build timestamp: ${this.timestamp}`);
    return items;
  }

  static async install() {
    await Package.global.pkgCmd('yarn install');
  }

  static loadBuildLog() {
    this.buildLogPath = join(CenvFiles.getGuaranteedMonoRoot(), './cenv.build.log');
    if (existsSync(this.buildLogPath)) {
      this.buildLog = JSON.parse(readFileSync(this.buildLogPath, 'utf-8'));
    } else {
      this.buildLog = {
        builds: [],
      };
    }
  }

  static packageHasBeenBuilt(packageName: string) {
    LibModule.loadBuildLog();
    for (let i = 0; i < this.buildLog.builds.length; i++) {
      const build = this.buildLog.builds[i];
      if (build.package === packageName) {
        return new Date(build.ts);
      }
    }
    return false;
  }

  static async build(options: BuildCommandOptions) {

    if (options.install) {
      await this.install();
    }

    Package.getPackages().map((p: Package) => {
      p.processStatus = ProcessStatus.BUILDING;
    });

    let parallel = '';
    if (options.parallel) {
      parallel = '--maxParallel=' + options.parallel;
    }
    await Package.global.pkgCmd(`nx affected:build --all --output-style=static${options.force ? ' --skip-nx-cache' : ''} ${parallel}`);

    return;
  }

  static fromModule(module: PackageModule) {
    return new LibModule(module.pkg, module.path, module.meta);
  }

  upToDate(): boolean {
    return this.hasBeenBuilt && ((this.isPublishable && this.version.toString() === this.publishedVersion?.toString()) || !this.isPublishable);
  }

  getDetails() {
    if (this.buildStatus === LibStatus.SUCCESS) {
      this.status.deployed.push(this.statusLine('build succeeded', `at [${this.timestamp?.toLocaleString()}]`, false));
    } else if (this.hasBeenBuilt) {
      this.status.deployed.push(this.statusLine('build succeeded', `previously at [${this.previousBuildTs?.toLocaleString()}]`, false));
    } else if (this.buildStatus === LibStatus.FAILED) {
      this.status.incomplete.push(this.statusLine('build failed', `at [${this.timestamp?.toLocaleString()}]`, true));
    } else {
      this.status.incomplete.push(this.statusLine('unbuilt', `no attempt to build has been made yet`, true));
    }

    if (this.isPublishable) {
      if (this.version.toString() === this.publishedVersion?.toString()) {
        this.status.deployed.push(this.statusLine('published', `version [${this.version.toString()}] has been published`, false));
      } else if (this.publishedVersion) {
        this.status.incomplete.push(this.statusLine('published out of date', `published version: [${this.publishedVersion?.toString()}] current version: [${this.version?.toString()}]`, true));
      } else {
        this.status.incomplete.push(this.statusLine('not published', `current version [${this.version?.toString()}] not published`, true));
      }
    }

  }

  reset() {
    this.status = { needsFix: [], deployed: [], incomplete: [] };
    this.checked = false;
  }

  statusIssues() {
    //this.verbose(`timestamp: ${this.timestamp?.toLocaleString()}`,`[${this.buildStatus}]`, 'build status');
  }

  writeBuildLog() {
    LibModule.loadBuildLog();
    LibModule.buildLog.builds.push({
                                     package: this.pkg.packageName, ts: new Date(),
                                   });
    writeFileSync(LibModule.buildLogPath, JSON.stringify(LibModule.buildLog, null, 2));
  }

  async deploy(force = false, completedWhenDone = false) {
    this.pkg.setActiveModule(this.type);
    await this.build(force, completedWhenDone);
    if (this.isPublishable) {
      await this.publish();
    }
  }

  async updatePublishedStatus(silent = false) {
    try {
      if (!this.isPublishable || this.publishedVersion === this.version) {
        return;
      }

      const latestPublished = await execCmd(`npm view ${this.name} version`, { packageModule: this, silent: true });
      this.publishedVersion = parse(latestPublished.trim())
    } catch (e) {
      if (!silent) {
        CenvLog.single.info(['typeof', typeof e, e] + 'publishing failed for ' + this.name, this.pkg.stackName)
      }
    }
  }

  async publish() {
    await this.updatePublishedStatus();
    if (this.publishedVersion?.toString() === this.version.toString()) {
      return;
    }
    const publishCmdString = `cenv lib publish ${this.name} (not implemented yet)`;
    const publishCmd = this.pkg.createCmd(publishCmdString);
    try {
      const opt = { cenvVars: {}, pkgCmd: publishCmd };
      const res = await this.pkg.pkgCmd(`npm publish --access public`, {
        packageModule: this, redirectStdErrToStdOut: false, ...opt,
      });
      publishCmd.result(res.res !== undefined ? res.res : res);
    } catch (e) {
      CenvLog.single.errorLog(`publishing failed for ${this.name}: ` + e, this.pkg.stackName)
      publishCmd.result(992);
    }
  }

  async build(force = false, completedWhenDone = false, cmd?: PackageCmd) {
    if (this.meta.skipDeployBuild && !force) {
      return true;
    }
    this.pkg.processStatus = ProcessStatus.BUILDING;
    if (!this.pkg.isRoot) {
      const buildCmdString = `cenv build ${this.name}`;
      if (cmd) {
        cmd.out(buildCmdString);
      }
      const buildCmd = cmd ? cmd : this.pkg.createCmd(buildCmdString);
      try {
        const opt = {
          cenvVars: {},
          pkgCmd: buildCmd
        };
        if (this.pkg.params && this.meta?.cenv?.lib?.loadVars) {
          await this.pkg.params.loadVars();
        }
        const res = await this.pkg.pkgCmd(`pnpm --filter ${this.name} build`,
          {
          packageModule: this,
          redirectStdErrToStdOut: true,
          ...opt,
        });
        buildCmd.result(res.res !== undefined ? res.res : res);
      } catch (e) {
        this.buildStatus = LibStatus.FAILED;
        throw e;
      //  if (buildCmd.code === undefined) {
      //    buildCmd.result(-44);
      //  }
      //  this.pkg.setBroken(`[${this.name}] build failed`, true);
      //  Deployment.setDeployStatus(this.pkg, ProcessStatus.FAILED);
      //  this.buildStatus = LibStatus.FAILED;
      // return false;
      }
    }
    if (Version.bumpMode !== BumpMode.DISABLED) {
      this.pkg.processStatus = ProcessStatus.HASHING;
      await this.hash();
    }
    this.writeBuildLog();
    if (completedWhenDone) {
      this.pkg.processStatus = ProcessStatus.COMPLETED;
    } else {
      this.pkg.processStatus = ProcessStatus.PROCESSING;
    }
    this.buildStatus = LibStatus.SUCCESS;
    this.timestamp = new Date();
    this.verbose(`timestamp: ${this.timestamp?.toLocaleString()}`, `[${this.buildStatus}]`, 'build status');
    this.hasBeenBuilt = true;
    return true;

  }

  // TODO: must compute separate hashes per module..
  async hash() {
    if (this?.meta?.versionHashDir) {
      this.meta.currentHash = await computeMetaHash(this.pkg, join(this.path, this.meta.versionHashDir));
    } else {
      if (this.pkg.isRoot) {
        this.meta.currentHash = await computeMetaHash(this.pkg, join(this.path, 'package.json'));
      } else if (this.path) {
        this.meta.currentHash = await computeMetaHash(this.pkg, this.path);
      }
    }
  }

  printCheckStatusComplete(silent = false): void {
    this.getDetails();
    if (!silent) {
      this.status.deployed.map((s) => CenvLog.single.info(s, this.pkg.stackName));
      this.status.incomplete.map((s) => CenvLog.single.info(s, this.pkg.stackName));
      this.status.needsFix.map((s) => CenvLog.single.info(s, this.pkg.stackName));
    }
    this.checked = true;
  }

  async checkStatus(silent = false) {
    this.printCheckStatusStart();
    await this.updatePublishedStatus();
    if (!this.hasCheckedLogs) {
      const res = LibModule.packageHasBeenBuilt(this.pkg.packageName);
      if (res) {
        this.previousBuildTs = res;
        this.hasBeenBuilt = true;
        this.hasCheckedLogs = true;
      }
    }

    // no op
    this.printCheckStatusComplete(silent);
  }
}
