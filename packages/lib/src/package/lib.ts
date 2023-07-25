import {BuildCommandOptions, Package, ProcessStatus, TPackageMeta} from './package';
import {IPackageModule, PackageModule, PackageModuleType} from './module';
import {CenvLog} from '../log';
import {Deployment} from "../deployment";
import {BumpMode, Version} from "../version";
import { computeMetaHash, getGuaranteedMonoRoot, getMonoRoot } from '../utils';
import {join} from "path";
import {existsSync, readFileSync, writeFileSync} from "fs";

export enum LibStatus {
  SUCCESS = 'SUCCESS', FAILED = 'FAILED', UNBUILT = 'UNBUILT'
}

export class LibModule extends PackageModule {
  public static buildLog: any;
  public static buildLogPath: string;
  buildStatus: LibStatus = LibStatus.UNBUILT;
  timestamp?: Date;
  hasBeenBuilt = false;
  previousBuildTs?: Date;
  hasCheckedLogs = false;

  constructor(pkg: Package, path: string, meta: TPackageMeta) {
    super(pkg, path, meta, PackageModuleType.LIB);
  }

  get anythingDeployed(): boolean {
    return this.buildStatus === LibStatus.SUCCESS;
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
    this.buildLogPath = join(getGuaranteedMonoRoot(), './cenv.build.log');
    if (existsSync(this.buildLogPath)) {
      this.buildLog = JSON.parse(readFileSync(this.buildLogPath, 'utf-8'));
    } else {
      this.buildLog = {
        builds: []
      }
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

    //const projects = await execCmd(getMonoRoot(), 'nx show projects --all')
  }

  static fromModule(module: PackageModule) {
    return new LibModule(module.pkg, module.path, module.meta);
  }

  upToDate(): boolean {
    if (!this.hasCheckedLogs) {
      const res = LibModule.packageHasBeenBuilt(this.pkg.packageName);
      if (!res) {
        return false;
      }
      this.previousBuildTs = res;
      this.hasBeenBuilt = true;
      this.hasCheckedLogs = true;
    }
    return this.hasBeenBuilt;
  }

  getDetails() {
    if (this.buildStatus === LibStatus.SUCCESS) {
      this.status.deployed.push(this.statusLine('build succeeded', `build succeeded at [${this.timestamp?.toLocaleString()}]`, false,));
      return;
    } else if (this.hasBeenBuilt) {
      this.status.deployed.push(this.statusLine('build succeeded', `previously a build succeeded at [${this.previousBuildTs?.toLocaleString()}]`, false,));
      return;
    }
    if (this.buildStatus === LibStatus.FAILED) {
      this.status.needsFix.push(this.statusLine('build failed', `build failed at [${this.timestamp?.toLocaleString()}]`, true,));
    } else {
      this.status.incomplete.push(this.statusLine('unbuilt', `no attempt to build has been made yet`, true,));
    }
  }

  reset() {
    this.status = {needsFix: [], deployed: [], incomplete: []};
    this.checked = false;
  }

  statusIssues() {
    //this.verbose(`timestamp: ${this.timestamp?.toLocaleString()}`,`[${this.buildStatus}]`, 'build status');
  }

  writeBuildLog() {
    LibModule.loadBuildLog();
    LibModule.buildLog.builds.push({
                                     package: this.pkg.packageName, ts: new Date()
                                   })
    writeFileSync(LibModule.buildLogPath, JSON.stringify(LibModule.buildLog, null, 2));
  }

  async build(force = false, completedWhenDone = false) {
    try {
      if (this.meta.skipDeployBuild && !force) {
        return true;
      }
      this.pkg.processStatus = ProcessStatus.BUILDING;
      if (!this.pkg.isRoot) {
        const buildCmdString = `cenv build ${this.name}`;
        const buildCmd = this.pkg.createCmd(buildCmdString)
        try {
          const opt = {cenvVars: {}, pkgCmd: buildCmd};
          if (this.pkg.params && this.meta?.cenv?.lib?.loadVars) {
            await this.pkg.params.loadVars();
          }
          const res = await this.pkg.pkgCmd(`pnpm --filter ${this.name} build`, {
            packageModule: this,
            redirectStdErrToStdOut: true, ...opt
          });
          buildCmd.result(res.res !== undefined ? res.res : res);
        } catch (e) {
          if (buildCmd.code === undefined) {
            buildCmd.result(-44);
          }
          this.pkg.setBroken(`[${this.name}] build failed`, true);
          Deployment.setDeployStatus(this.pkg, ProcessStatus.FAILED);
          this.buildStatus = LibStatus.FAILED;
          return false;
        }
      }
      if (Version.bumpMode !== BumpMode.DISABLED) {
        this.pkg.processStatus = ProcessStatus.HASHING;
        await this.hash();
      }
      this.writeBuildLog()
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
    } catch (e) {
      if (e instanceof Error) {
        CenvLog.single.errorLog(e.stack || 'build failed', this.pkg.stackName, true);
      }
      return false
    }
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

  printCheckStatusComplete(): void {
    this.getDetails();
    this.checked = true;

  }

  async checkStatus() {
    this.printCheckStatusStart();
    if (this.buildStatus === LibStatus.UNBUILT) {
      //await this.build();
    }
    // no op
    this.printCheckStatusComplete();
  }
}
