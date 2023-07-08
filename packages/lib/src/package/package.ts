import {computeMetaHash, execCmd, getMonoRoot, packagePath, spawnCmd, Timer} from '../utils';
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from 'path';
import { PackageStatus } from './module'
import { CenvLog, colors, LogLevel, Mouth } from '../log';
import { BumpMode, Version } from '../version';
import semver, { coerce, inc, parse, SemVer } from 'semver';
import { PackageModule, PackageModuleType } from './module';
import { ParamsModule } from './params';
import { DockerModule } from './docker';
import { StackModule } from './stack';
import {BaseCommandOptions } from '../params';
import { Cenv } from '../cenv'
import { AppVarsFile, EnvVarsFile } from '../file';
import { LibModule } from './lib';
import { ExecutableModule } from './executable';
import {Deployment} from "../deployment";
import * as util from "util";

export interface BuildCommandOptions extends BaseCommandOptions {
  install?: boolean,
  force?: boolean,
  parallel?: string
}

export enum EnvironmentStatus {
  NONE = '------------',
  INITIALIZING = 'INITIALIZING',
  CANCELLED = 'CANCELLED',
  NOT_DEPLOYED = 'NOT_DEPLOYED',
  NEEDS_UPDATE = 'NEEDS_UPDATE',
  NEEDS_FIX = 'NEEDS_FIX',
  INCOMPLETE = 'INCOMPLETE',
  UP_TO_DATE = 'UP_TO_DATE',
}

export enum ProcessStatus {
  NONE = '------------',
  INITIALIZING = 'INITIALIZING',
  BUILDING = 'BUILDING',
  HASHING = 'HASHING',
  BUMP = 'BUMP',
  STATUS_CHK = 'STATUS_CHK',
  HAS_PREREQS = 'HAS_PREREQS',
  READY = 'READY',
  PROCESSING = 'PROCESSING',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
  COMPLETED = ' ',
}

function cmdResult(
  stackName: string,
  packageName: string,
  cmd: string,
  failOnError: boolean,
  code: number,
  message?: string | string[],
  minOut?: string
): boolean {

  const pkg = Package.cache[stackName];

  let completeMsg = '';
  if (message) {
    completeMsg = (Array.isArray(message) ? message.join(' ') : message) + ' - '
  }

  if (code === 0) {
    pkg?.std(`${completeMsg}exit code (${code}) [success]`, cmd);
    return true;
  }
  if (CenvLog.logLevel === LogLevel.MINIMAL && minOut !== '') {
    pkg?.err(minOut)
  }

  pkg.err(`${completeMsg}exit code (${code}) [failed]`, cmd);
  if (failOnError) {
    Package?.callbacks?.cancelDependencies(pkg);
    pkg.setDeployStatus(ProcessStatus.FAILED);
    return false;
  }

  return true;
}

export type Cmd = {
  stdout?: string;
  stderr?: string;
  cmd?: string;
  code?: number;
  out: (...message: string[]) => void;
  err: (...message: string[]) => void;
  result: (code: number, message?: string | string[]) => boolean;
};

class LogCmd implements Cmd {
  cmd;
  code;
  res;
  stdout?: string;
  stderr?: string;
  constructor(cmd: string, code: number = undefined, message: string = undefined) {
    this.cmd = cmd;

    if (code) {
      this.code = code;
      this.res = cmdResult(
        'GLOBAL',
        'GLOBAL',
        cmd,
        false,
        code,
        message,
      );
    } else {
      CenvLog.single.stdLog(cmd);
    }
  }

  out(message: string) {
    CenvLog.info(message);
  }
  err(message: string) {
    CenvLog.single.errorLog(message);
  }

  result(code: number, message?: string | string[]) {
    if (this.code) {
      return !!this.code;
    }
    return cmdResult('GLOBAL', 'GLOBAL', this.cmd, false, code, message);
  }
}

export class PackageCmd implements Cmd {
  cmd: string;
  stdout? = '';
  stderr? = '';
  stdtemp: any = undefined;
  vars: { [key: string]: string } = {};
  code: number = undefined;
  failOnError = true;
  stackName: string;
  index: number;
  active: boolean;
  alwaysScroll = true;
  pkg: Package;
  scrollPos = 0;
  res;
  minOut = '';

  constructor(
    pkg: Package,
    cmd: string,
    code: number = undefined,
    message: string = undefined,
    failOnError = true,
  ) {
    this.stackName = pkg?.stackName;
    this.cmd = cmd;
    this.pkg = pkg;

    pkg?.cmds?.push(this);
    this.index = pkg?.cmds?.length;

    if (failOnError) {
      this.failOnError = failOnError;
    }

    if (message && code !== undefined) {
      if (code === 0) {
        this.stdout = message;
      } else {
        this.stderr = message;
      }
    }

    if (code) {
      this.code = code;
      this.res = cmdResult(
        pkg.stackName,
        pkg.packageName,
        cmd,
        failOnError,
        code,
        message,
      );
    }
  }

  get running() {
    return this.code === undefined;
  }

  ensureCommand(){
    if (!this.running) {
      this.pkg.createCmd('log');
    }
  }

  out(...message: string[]) {
    this.ensureCommand();
    this.minOut += message.join(' ') + '\n'
    this.pkg.std(...message);
  }

  info(...message: string[]) {
    this.ensureCommand();
    this.minOut += message.join(' ') + '\n'
    this.pkg.info(...message);
  }

  err(...message: string[]) {
    this.ensureCommand();
    this.pkg.err(...message);
  }

  result(code: number, message?: string | string[]) {
    if (this.res) {
      return this.res;
    }
    this.ensureCommand();
    this.res = cmdResult(
      this.pkg.stackName,
      this.pkg.packageName,
      this.cmd,
      this.failOnError,
      code,
      message,
      this.minOut
    );
    this.code = code;
    return this.res;
  }

  static createCmd(cmd: string, code: number = undefined, message: string = undefined): Cmd {
    if (Cenv.dashboard) {
      return Package.getPackage('GLOBAL').createCmd(cmd, code, message);
    } else {
      return new LogCmd(cmd, code, message);
    }
  }
}

export interface IPackageMeta {
  dockerBaseImage?: string;
  deployDependencies?: Package[];
  destroyDependencies?: Package[];
  dependencies?: { [key: string]: string };
  deployDependencyNames?: string[];
  destroyDependencyNames?: string[];
  dependencyDelay?: string;
  preBuildScripts?: string[];
  preDeployScripts?: string[];
  postDeployScripts?: string[];
  versionHashDir?: string;
  versionHash?: string;
  buildHash?: string;
  currentHash?: string;
  currentVersion?: semver.SemVer;
  buildVersion?: semver.SemVer;
  version: semver.SemVer;
  name: string;
  skipDeployBuild: boolean;
  verifyStack?: string;
  deployStack?: string;
  destroyStack?: string;
  executables?: { exec: string, installed: boolean }[];
  dockerType: string;
  url?: string;
  volatileContextKeys?: string[]
  bin: any;
  scripts: any;
}

export class PackageMetaConsolidated implements IPackageMeta {
  dockerBaseImage?: string;
  deployDependencies?: Package[] = [];
  destroyDependencies?: Package[] = [];
  dependencies?: { [key: string]: string } = {};
  dependencyDelay?: string;
  preBuildScripts?: string[] = [];
  preDeployScripts?: string[] = [];
  postDeployScripts?: string[] = [];
  versionHashDir?: string;
  versionHash?: string;
  buildHash?: string;
  currentHash?: string;
  currentVersion?: semver.SemVer;
  buildVersion?: semver.SemVer;
  version: semver.SemVer;
  name: string;
  skipDeployBuild: boolean;
  verifyStack?: string;
  deployStack?: string;
  destroyStack?: string;
  executables?: { exec: string, installed: boolean }[] = [];
  dockerType: string;
  url?: string;
  volatileContextKeys?: string[] = [];
  bin: any = {};
  scripts: any = {};

  // used to reference modules to metas
  // Record<moduleType, packagePath>
  modules: Record<string, string> = {};

  // Record<packagePath, meta>
  metas: Record<string, IPackageMeta> = {};

  load(packagePath: string): IPackageMeta {
    if (this.metas[packagePath]) {
      return this.metas[packagePath];
    }

    if (!packagePath) {
      CenvLog.single.catchLog(new Error(`[${packagePath}] getPackageMeta failed: attempting to get meta data from an undefined packagePath`));
    }

    const pkgMeta = require(path.resolve(packagePath, 'package.json'));

    const dep = {
      deployDependencies: pkgMeta?.deployDependencies ? pkgMeta?.deployDependencies.map((dep: string) => Package.fromPackageName(dep)) : [],
      destroyDependencies: pkgMeta?.destroyDependencies ? pkgMeta?.destroyDependencies.map((dep: string) => Package.fromPackageName(dep)) : [],
      dependencyDelay: pkgMeta?.dependencyDelay,
      preBuildScripts: pkgMeta?.preBuildScripts ? pkgMeta?.preBuildScripts : [],
      preDeployScripts: pkgMeta?.preDeployScripts ? pkgMeta?.preDeployScripts : [],
      postDeployScripts: pkgMeta?.postDeployScripts ? pkgMeta?.postDeployScripts : [],
      dependencies: pkgMeta?.dependencies,
      versionHashDir: pkgMeta?.versionHashDir,
      versionHash: pkgMeta?.versionHash,
      buildHash: pkgMeta?.buildHash,
      currentHash: pkgMeta?.currentHash,
      version: pkgMeta?.version,
      buildVersion: pkgMeta?.buildVersion,
      currentVersion: pkgMeta?.currentVersion,
      name: pkgMeta?.name,
      skipDeployBuild: pkgMeta?.skipDeployBuild,
      verifyStack: pkgMeta?.verifyStack,
      deployStack: pkgMeta?.deployStack,
      destroyStack: pkgMeta?.destroyStack,
      volatileContextKeys: pkgMeta?.volatileContextKeys ? pkgMeta?.volatileContextKeys : [],
      dockerType: pkgMeta?.dockerType,
      url: pkgMeta?.url,
      bin: pkgMeta?.bin,
      scripts: pkgMeta?.scripts
    };

    this.metas[packagePath] = dep;

    this.deployDependencies = this.deployDependencies.concat(dep.deployDependencies);
    this.destroyDependencies = this.destroyDependencies.concat(dep.destroyDependencies);
    this.dependencyDelay = dep?.dependencyDelay;
    this.preBuildScripts = this.preBuildScripts.concat(dep?.preBuildScripts);
    this.preDeployScripts = this.preDeployScripts.concat(dep?.preDeployScripts);
    this.postDeployScripts = this.postDeployScripts.concat(dep?.postDeployScripts);
    this.dependencies = { ...this.dependencies, ...dep?.dependencies };
    this.versionHashDir = dep?.versionHashDir;
    this.versionHash = dep?.versionHash;
    this.buildHash = dep?.buildHash;
    this.currentHash = dep?.currentHash;
    this.version = dep?.version;
    this.buildVersion = dep?.buildVersion;
    this.currentVersion = dep?.currentVersion;
    this.name = dep?.name;
    this.skipDeployBuild = dep?.skipDeployBuild;
    this.verifyStack = dep?.verifyStack;
    this.deployStack = dep?.deployStack;
    this.destroyStack = dep?.destroyStack;
    this.dockerType = dep?.dockerType;
    this.url = dep?.url;
    this.volatileContextKeys = dep?.volatileContextKeys;
  }

  addModule(module: PackageModule, packagePath: string) {
    this.modules[module.constructor.name] = packagePath;
    this.bin[packagePath] = this.metas[packagePath].bin;
    this.scripts[packagePath] = this.metas[packagePath].scripts;
  }
}

export interface IPackage {
  name: string;
  stackName: string;
  fullType: string;
  params: ParamsModule;
  docker: DockerModule;
  stack: StackModule;
  lib: LibModule;
  exec: ExecutableModule;
  meta: IPackageMeta;
  statusTime: number;
  processStatus: ProcessStatus;
  environmentStatus: EnvironmentStatus;
  timer: Timer;

  cmds: PackageCmd[];
  isGlobal: boolean;
  isRoot: boolean;
  activeCmdIndex: number;
  activeModuleIndex: number;
  modules: PackageModule[];
  cenvVars?: any;
  skipUI?: boolean;

  links: string[];
  primaryLink: string;
  local: boolean;
  root: boolean;
}

export interface CommandEvents {
  preCommandFunc?: () => Promise<void>,
  postCommandFunc?: () => Promise<void>
}

export class Package implements IPackage {
  name: string;
  fullType: string;
  stackName: string;
  params: ParamsModule;
  docker: DockerModule;
  stack: StackModule;
  lib: LibModule;
  exec: ExecutableModule;
  statusTime: number;
  processStatus: ProcessStatus = undefined;
  environmentStatus: EnvironmentStatus = EnvironmentStatus.NONE;
  environmentStatusReal: EnvironmentStatus = EnvironmentStatus.NONE;
  timer: Timer;
  timerFinalElapsed: string;
  cmds: PackageCmd[];
  isGlobal = false;
  isRoot = false;
  activeCmdIndex: number;
  activeModuleIndex: number;
  modules: PackageModule[];
  cenvVars?: any;

  // app config
  links: string[] = [];
  primaryLink: string;

  local = false;
  root = false;
  status: PackageStatus = { incomplete: [], deployed: [], needsFix: [] };
  statusCheckComplete = false;
  skipUI = false;
  skipDeployBuild = false;
  broken? = false;
  notComplete? = false;
  brokenText = '';
  packageModules?: { [packageName: string]: PackageModule[] } = {};
  deploymentBlocked? = false;
  mouth: Mouth;
  meta: PackageMetaConsolidated = new PackageMetaConsolidated();
  deployDependencies?: Package[];
  deployDependenciesRemaining?: Package[];

  static loading = true;
  static deployment: any;
  static callbacks: any = {};
  static suites: any = {};
  static defaultSuite: string;

  public static buildLog: any;
  public static buildLogPath: string;

  public static stackNameMaxVisibleLength = 29;

  constructor(packageName: string, noCache = false) {
    this.load(packageName, noCache);
  }

  get stackNameVis(): string {
    return this.stackName.substring(0, Package.stackNameMaxVisibleLength);
  }
  get type(): string {
    return this.fullType?.split('-')[0];
  }

  static get global(): Package {
    return Package.fromStackName('GLOBAL');
  }

  load(packageName: string, noCache = false) {
    if (!Package.loading && !noCache) {
      const err = new Error(
          `attempting to load ${packageName} after loading has been disabled`,
      );
      this.err(err.stack);
    }

    try {
      const stackName = Package.packageNameToStackName(packageName);
      if (!noCache && Package.cache[stackName]) {
        return Package.cache[stackName];
      }
      this.stackName = stackName;

      let packageMetaPath;
      const isRoot = packageName === Package.getRootPackageName();
      const isGlobal = packageName === 'GLOBAL';

      if (isRoot || isGlobal) {
        packageMetaPath = getMonoRoot();
        this.fullType = packageName.toLowerCase();
      } else {
        packageMetaPath = packagePath(packageName);
      }

      const pkgPath = packageMetaPath;
      if (!pkgPath) {
        CenvLog.single.catchLog(`could not load package: ${packageName}`);
      }

      /*
      if (!existsSync(pkgPath) && !monoRoot) {
        monoRoot = getMonoRoot();
        pkgPath = join(monoRoot, 'node_modules', packageName);
        console.log('monoRoot pkgPath', pkgPath)
        if (!existsSync(pkgPath)) {
          CenvLog.single.catchLog(
              new Error(`[${packageName}] failed: attempting to get meta data from an undefined packagePath`),
          );
        }
      }
      */

      const pkgPathParts = pkgPath.split('/');

      if (!this.fullType) {
        while ( pkgPathParts.shift() !== 'packages' && pkgPathParts.length > 0) { /* loop  until done sucka */ }
        this.fullType = pkgPathParts.shift();
      }


      this.meta.load(pkgPath);
      const pathMeta = this.meta.metas[packageMetaPath];

      const paramsPackage = existsSync(path.join(pkgPath, AppVarsFile.NAME)) || existsSync(path.join(pkgPath, EnvVarsFile.NAME));
      if (paramsPackage) {
        this.params = new ParamsModule({ pkg: this, path: pkgPath });
      }

      if (existsSync(path.join(pkgPath, './cdk.json')) || pathMeta.deployStack) {
        this.stack = new StackModule({ pkg: this, path: pkgPath });
      }

      if (existsSync(path.join(pkgPath, './Dockerfile'))) {
        this.docker = new DockerModule({ pkg: this, path: pkgPath });
      }

      if (pathMeta.bin) {
        this.exec = new ExecutableModule({ pkg: this, path: pkgPath })
      }

      if (pathMeta.scripts?.build) {
        this.lib = new LibModule({ pkg: this, path: pkgPath });
      }

      if ((this.docker || this.params || this.lib || this.exec) && !this.stack) {
        this.stack = this.addStackModule(packageName, pkgPath)
      }

      if (!isGlobal && !this.docker && !this.params && !this.docker && !this.lib && !this.exec) {
        const errString = `${colors.alertBold(packageName)} is not a valid package`;
        CenvLog.single.catchLog(new Error(errString));
        return undefined;
      }

      this.name = stackName.replace(process.env.ENV + '-', '');
      if (!isGlobal) {
        this.modules = [this.params, this.docker, this.stack, this.lib, this.exec].filter((n) => n) as PackageModule[];
        this.modules.map((m) => {
          if (!this.packageModules[m.name.toString()]) {
            this.packageModules[m.name.toString()] = [];
          }
          this.packageModules[m.name.toString()].push(m);
        });
      } else {
        this.modules = [];
      }
      this.ensureModuleVersionConsistency();

      this.statusTime = Date.now();
      this.processStatus = isGlobal ? ProcessStatus.NONE : ProcessStatus.INITIALIZING;
      this.environmentStatus = isGlobal ? EnvironmentStatus.NONE : EnvironmentStatus.INITIALIZING;
      this.timer = null;
      this.cmds = [];
      this.isGlobal = isGlobal;
      this.isRoot = isRoot;
      this.activeCmdIndex = -1;
      this.activeModuleIndex = 0;
      this.mouth = new Mouth(stackName, stackName);
      this.timer = new Timer(stackName, 'seconds');

      if (!noCache) {
        Package.cache[stackName] = this;
      }
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }

  setBroken(brokenText: string, deploymentBlocked = false) {
    this.brokenText = brokenText;
    this.broken = true;
    if (deploymentBlocked) {
      this.deploymentBlocked = deploymentBlocked;
    }
  }

  addStackModule(packageName: string, pkgPath: string) {
    const deployPath = path.join(pkgPath, 'deploy');
    const cdkPath = path.join(deployPath, './cdk.json');
    const hasDeploy = existsSync(deployPath) && existsSync(cdkPath);

    if (hasDeploy) {
      const meta = this.meta.load(deployPath);
      return new StackModule({
        pkg: this,
        path: deployPath,
        ...meta
      });
    }
    return undefined;
  }

  isParamDeploy(options?: any) {
    return this.params?.hasCenvVars && options?.parameters && (!options?.strictVersions || !this.params.upToDate())
  }

  isDockerDeploy(options?: any) {
    return this.docker && options?.docker && (!options?.strictVersions || !this.docker.upToDate())
  }

  isStackDeploy(options?: any) {
    return this.stack && options?.stack && (!options?.strictVersions || !this.stack.upToDate())
  }
  async destroy (deployOptions: any) {

    if (this.isStackDeploy(deployOptions)) {
      await this.stack.destroy();
    }

    if (this.isDockerDeploy(deployOptions)) {
      await this.docker.destroy();
    }

    if (this.isParamDeploy(deployOptions)) {
      await this.params.destroy();
    }
  }

  async deploy(deployOptions: any) {
    const options: any = {
      failOnError: true,
      envVars: {
        CENV_LOG_LEVEL: deployOptions.logLevel,
        CENV_DEFAULTS: 'true'
      },
    };

    if (this.lib) {
      await this.lib.build();
    }

    if (this.isParamDeploy(deployOptions)) {
      await this.params.deploy(options);
    }

    if (this.isDockerDeploy(deployOptions)) {
      await this.docker.deploy(options);
    }

    if (this.isStackDeploy(deployOptions)) {
      await this.stack.deploy(deployOptions, options);
    }
  }

  async depCheck() {
    await Promise.all(this.getPackageModules().map(async (packageModule: PackageModule) => {

        const unusedDeps = await this.pkgShell(
          `depcheck --json | jq -r '[.dependencies[]]|join(" ")'`,
          { packageModule },
        );

        if (unusedDeps && (unusedDeps as string).trim() !== '') {
          const depCheckRes = await this.pkgCmd(
            `yarn remove ${unusedDeps.trim()}`,
            {
              packageModule,
            },
          );

          if (depCheckRes) {
            this.setBroken(`[${packageModule.name}] depcheck failed`);
            return;
          }
        }
      }),
    );
  }

  getPackageModuleNames() {
    return Object.keys(this.packageModules)
  }

  getPackageModules(): PackageModule[] {
    const packageNames = this.getPackageModuleNames();
    return packageNames.map(pn => this.packageModules[pn][0])
  }

  async install() {
    await Promise.all(
      this.getPackageModules().map(async (packageModule: PackageModule) => {
        const depCheckRes = await this.pkgCmd(`yarn install`, {
          packageModule,
        });

        if (depCheckRes) {
          this.setBroken(`[${packageModule.name}] install failed`, true);
          return;
        }
      }),
    );
  }

  static loadBuildLog() {
    this.buildLogPath = path.join(getMonoRoot(), './cenv.build.log');
    if (existsSync(this.buildLogPath)) {
      this.buildLog = JSON.parse(readFileSync(this.buildLogPath, 'utf-8'));
    } else {
      this.buildLog = {
        builds: []
      }
    }
  }

  writeBuildLog() {
    Package.loadBuildLog();
    Package.buildLog.builds.push({
      package: this.packageName,
      ts: new Date()
    })
    writeFileSync(Package.buildLogPath, JSON.stringify(Package.buildLog, null, 2));
  }

  async build(force = false, install = false) {
    try {
      if (this.skipDeployBuild && !force) {
        return;
      }
      this.processStatus = ProcessStatus.BUILDING;
      if (!this.packageName) {
        console.log(
          this.params?.path || this.stack?.path || this.docker?.path,
        );
      }
      if (!this.isRoot) {
        await Promise.all(
          this.getPackageModules().map(async (packageModule: PackageModule) => {
            try {
              await this.pkgCmd(
                  `nx run ${packageModule.name}:build${force ? ' --skip-nx-cache' : ''}`,
                  {packageModule, returnOutput: true},
              );
            } catch (e) {
              this.setBroken(`[${packageModule.name}] build failed`, true);
              Deployment.setDeployStatus(this, ProcessStatus.FAILED);
              return false;
            }
          }),
        );
      }
      if (Version.bumpMode !== BumpMode.DISABLED) {
        this.processStatus = ProcessStatus.HASHING;
        await this.hash();
      }
      this.writeBuildLog()
      this.processStatus = ProcessStatus.COMPLETED;
      return true;
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }

  // TODO: must compute separate hashes per module..
  async hash() {
    if (this?.meta?.versionHashDir) {
      this.meta.currentHash = await computeMetaHash(this, path.join(this.path, this.meta.versionHashDir));
    } else {
      if (this.isRoot) {
        this.meta.currentHash = await computeMetaHash(this, path.join(this.path, 'package.json'));
      } else if (this.path) {
        this.meta.currentHash = await computeMetaHash(this, this.path);
      }
    }
  }

  setCmdIndex(cmdIndex: number) {
    this.activeCmdIndex = cmdIndex;
  }

  getType(type: PackageModuleType) {
    if (type === PackageModuleType.PARAMS) {
      return this.params;
    } else if (type === PackageModuleType.STACK) {
      return this.stack;
    } else {
      return this.docker;
    }
  }

  getConsoleUrl() {
    if (this.isGlobal) {
      return `https://${process.env.AWS_REGION}.console.aws.amazon.com/console/home?nc2=h_ct&region=${process.env.AWS_REGION}&src=header-signin#`;
    }
    const type = this.type;
    if (type === 'services') {
      return `https://${process.env.AWS_REGION}.console.aws.amazon.com/ecs/v2/clusters/${this.stackName}-cluster/services?region=${process.env.AWS_REGION}`;
    } else if (this.meta.url) {
      return this.meta.url;
    }
    return `https://${process.env.AWS_REGION}.console.aws.amazon.com`;
  }

  chDir() {
    const pkgPath = packagePath(this.packageName);
    if (!pkgPath) {
      return false;
    }

    const relativePath = path.relative(process.cwd(), pkgPath);
    if (relativePath !== '') {
      this.verbose(pkgPath, 'pkg cwd');
      process.chdir(relativePath);
    }
    return true;
  }

  public get packageName() {
    return this.isGlobal
      ? this.stackName
      : Package.stackNameToPackageName(this.stackName);
  }

  public get path() {
    return this.params?.path || this.docker?.path || this.stack?.path;
  }

  static fromPackageName(packageName: string): Package {
    const stackName = Package.packageNameToStackName(packageName);
    if (Package.cache[stackName]) {
      return Package.cache[stackName];
    }
    return new Package(packageName);
  }

  static fromStackName(stackName: string) {
    if (Package.cache[stackName]) {
      return Package.cache[stackName];
    }
    return new Package(Package.stackNameToPackageName(stackName));
  }

  hasChanged() {
    return this.meta.versionHash !== this.meta.currentHash;
  }

  static async install() {
    await this.getPackage('GLOBAL').pkgCmd('yarn install');
  }



  async bumpComplete() {
    if (this.rollupVersion) {
      this.std('build complete', `v${this.rollupVersion}`);
    }

    this.modules.map((m) => {
      m.bumpComplete();
    });
  }

  confirmPrerelease(prerelease: string) {
    if (!this.meta) {
      return;
    }
    const pre = parse(this.meta.buildVersion);

    if (pre.prerelease[0] !== prerelease) {
      CenvLog.single.catchLog(
        `[${this.packageName}] attempting to bump in ${ process.env.CENV_BUILD_TYPE } mode but prerelease version doesn't match. Expecting ${prerelease} but found ${pre.prerelease[0]} while bumping module ${this.type}.`,
      );
    }
    this.meta.version = coerce(pre);
    this.meta.buildVersion = undefined;
    this.meta.currentVersion = undefined;
  }

  useHighestVersion(versionA: SemVer, versionB: SemVer): SemVer {
    if (versionA && versionB) {
      if (versionA !== versionB) {
        if (versionA > versionB) {
          return versionA;
        } else {
          return versionB;
        }
      } else {
        return versionA;
      }
    }
    return versionA || versionB;
  }

  get moduleVersion(): SemVer {
    const modules = this.modules.filter(fm => !!fm.version).map(m => m?.version);
    if (!modules.length) {
      return undefined;
    }

    return modules.reduce((a, b) => {
      return this.useHighestVersion(a, b)
    });
  }

  get moduleBuildVersion(): SemVer {
    const modules = this.modules.filter(fm => !!fm.buildVersion);
    if (!modules.length) {
      return undefined;
    }
    return modules.map(m => m?.buildVersion).reduce((a, b) => {
      return this.useHighestVersion(a, b)
    });
  }

  get moduleCurrentVersion(): SemVer {
    const modules = this.modules.filter(fm => !!fm.currentVersion);
    if (!modules.length) {
      return undefined;
    }
    return modules.filter(fm => !!fm.currentVersion).map(m => m?.currentVersion).reduce((a, b) => {
      return this.useHighestVersion(a, b)
    });
  }

  get rollupVersion(): SemVer {
    return (
      this.moduleCurrentVersion || this.moduleBuildVersion || this.moduleVersion
    );
  }

  setVersion(versionType: any, version: SemVer) {
    if (this.params) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      this.params[versionType] = version;
    }
    if (this.stack) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      this.stack[versionType] = version;
    }
    if (this.docker) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      this.docker[versionType] = version;
    }
    if (this.meta) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      this.meta[versionType] = version;
    }
  }

  ensureModuleVersionConsistency() {
    this.setVersion('currentVersion', this.moduleCurrentVersion);
    this.setVersion('buildVersion', this.moduleBuildVersion);
    this.setVersion('version', this.moduleVersion);
  }

  static async build(options: BuildCommandOptions) {

    if (options.install) {
      await Package.install();
    }

    let packages: any = []
    Package.getPackages().map((p: Package) => {
      p.processStatus = ProcessStatus.BUILDING;
      packages = packages.concat(p.getPackageModuleNames());
    });

    let parallel = '';
    if (options.parallel) {
      parallel = '--maxParallel=' + options.parallel;
    }
    await Package.global.pkgCmd(`nx affected:build --all --output-style=static${options.force ? ' --skip-nx-cache' : ''} ${parallel}`);

    const projects = await execCmd(getMonoRoot(), 'nx show projects --all')
    CenvLog.single.catchLog(new Error(projects));
  }

  async bump(type: string) {
    try {
      this.processStatus = ProcessStatus.BUMP;
      if (type === 'reset') {
        this.info(colors.success(`v${this.moduleVersion}`));
        this.modules.map((m) => {
          m.bump(type);
        });
        return;
      }

      this.ensureModuleVersionConsistency();
      if (
        !this.meta ||
        !this.meta.currentHash ||
        this.meta.currentHash === (this.meta.buildHash || this.meta.versionHash)
      ) {
        return;
      }

      if (!process.env.CENV_BUILD_TYPE) {
        process.env.CENV_BUILD_TYPE = 'ALPHA_PRERELEASE';
      }

      const previousVersion = this.moduleVersion;

      switch (type) {
        case 'major':
        case 'minor':
        case 'patch':
          this.meta.currentVersion = semver.parse(
            inc(this.rollupVersion, type),
          );
          break;
        default:
          switch (process.env.CENV_BUILD_TYPE) {
            case 'RELEASE':
              this.confirmPrerelease('r');
              break;
            case 'ALPHA_RELEASE':
              this.confirmPrerelease('a');
              break;
            case 'BETA_RELEASE':
              this.confirmPrerelease('b');
              break;
            case 'PRERELEASE':
              this.meta.currentVersion = semver.parse(
                inc(this.rollupVersion, 'prerelease', 'r'),
              );
              break;
            case 'BETA_PRERELEASE':
              this.meta.currentVersion = semver.parse(
                inc(this.rollupVersion, 'prerelease', 'b'),
              );
              break;
            // considered alpha prerelease by default
            case 'ALPHA_PRERELEASE':
            default:
              this.meta.currentVersion = semver.parse(
                inc(this.rollupVersion, 'prerelease', 'a'),
              );
              break;
          }

          break;
      }

      this.info('current version', `[${this.rollupVersion}] released version: ${this.moduleVersion}`);

      this.modules.map((m) => {
        m.bump(type);
      });

      const newVersion = this.meta.version;
      if (previousVersion === newVersion) {
        return;
      }
      this.createCmd(
        `${this.packageName} trigger upgrade: ${previousVersion} to ${newVersion}`,
        0,
      );

      const packages = Package.getPackages();

      await Promise.all(
        packages.map(async (p: Package) => {
          if (
            p.packageName !== this.packageName &&
            p.meta?.dependencies &&
            Object.keys(p.meta?.dependencies)?.includes(this.packageName)
          ) {
            await p.bump(type);
          }
        }),
      );
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }

  createCmd(
    command: string,
    code: number = undefined,
    message: string = undefined,
    addToGloalLog = false
  ) {
    try {
      const latestCmdActive = this.cmds ? this.activeCmdIndex === this.cmds.length - 1 : false;
      const cmd = new PackageCmd(this, command, code, message);
      if (latestCmdActive) {
        this.activeCmdIndex = this.cmds.length - 1;
      }
      return cmd;
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }

  public static cache: { [stackName: string]: Package } = {};

  static packageNameToDockerName(packageName: string) {
    return packageName.replace('@', ``).replace(/-(deploy)$/, '');
  }

  async hasCheckedStatus() {
    return !this.modules.filter(m => !m.checked).length;
  }

  upToDate() {
    return !this.modules.filter(m => !m.upToDate()).length;
  }

  getEnvironmentStatusDescription() {
    switch (this.environmentStatus) {
      case EnvironmentStatus.NONE:
        return;
      case EnvironmentStatus.NEEDS_UPDATE:
        return 'needs to deploy';
      case EnvironmentStatus.UP_TO_DATE:
        return 'latest is fully deployed';
      case EnvironmentStatus.NOT_DEPLOYED:
        return 'not deployed at all';
    }
  }

  protected async checkModuleStatus() {
    //delete this.timer;
    this.processStatus = ProcessStatus.STATUS_CHK;

    await this.lib?.checkStatus();
    await this.exec?.checkStatus();
    await this.params?.checkStatus();
    await this.docker?.checkStatus();
    await this.stack?.checkStatus();
  }

  async finalizeStatus(targetMode: string = undefined, endStatus: ProcessStatus = undefined) {

    this.status = { incomplete: [], needsFix: [], deployed: []};
    this.modules.map((m: PackageModule) => {
      this.status.incomplete = this.status.incomplete.concat(m.status.incomplete);
      this.status.needsFix = this.status.needsFix.concat(m.status.needsFix);
      this.status.deployed = this.status.deployed.concat(m.status.deployed);
    });

    if (this.upToDate()) {
      this.environmentStatus = EnvironmentStatus.UP_TO_DATE;
    } else if (this.incomplete) {
      this.environmentStatus = EnvironmentStatus.INCOMPLETE;
    } else if (this.modules.filter(m => m.anythingDeployed).length) {
      this.environmentStatus = EnvironmentStatus.NEEDS_UPDATE;
    } else {
      this.environmentStatus = EnvironmentStatus.NOT_DEPLOYED;
    }
    this.environmentStatusReal = this.environmentStatus;
    if (this.status.needsFix.length) {
      this.environmentStatusReal = EnvironmentStatus.NEEDS_FIX;
    }

    this.modules.map(m => {
      if ((targetMode === 'DEPLOY' && !m.upToDate()) || (targetMode === 'DESTROY' && m.anythingDeployed) || (!targetMode && m)) {
        m.statusIssues();
      }
    })

    this.statusCheckComplete = true;
    if (endStatus) {
      this.processStatus = endStatus;
    } else if (targetMode === 'DEPLOY') {
      this.processStatus = this.environmentStatus === EnvironmentStatus.UP_TO_DATE ? ProcessStatus.COMPLETED : ProcessStatus.PROCESSING;
    } else if (targetMode === 'DESTROY') {
      this.processStatus = this.environmentStatus === EnvironmentStatus.NOT_DEPLOYED ? ProcessStatus.COMPLETED : ProcessStatus.PROCESSING;
    }
  }

  async checkStatus(targetMode: string = undefined, endStatus: ProcessStatus = undefined) {
    const cmd = this.createCmd('cenv stat');
    this.resetStatus()
    await this.checkModuleStatus();
    await this.finalizeStatus(targetMode, endStatus);
    cmd.result(0, `[${this.environmentStatus}]`);
  }

  get needsFix() {
    return this.broken || this.modules.filter(m => m.needsFix).length;
  }

  get incomplete() {
    return this.notComplete || this.modules.filter(m => m.incomplete).length
  }

  resetStatus() {
    this.statusCheckComplete = false;
    this.modules.map(m => m.reset());
  }

  static async checkStatus(targetMode: string = undefined, endStatus: ProcessStatus = undefined) {
    return this.getPackages().map(async (p: Package) => {
      await p?.checkStatus(targetMode, endStatus)
    });
  }

  setDeployStatus(status: ProcessStatus) {
    if (this.processStatus === ProcessStatus.FAILED || this.processStatus === ProcessStatus.CANCELLED) {
      return;
    }
    this.processStatus = status;
  }

  getCommand(cmdText: string) {
    const cmds = this.cmds.filter((c) => c.cmd === cmdText);
    if (cmds?.length) {
      return cmds[0];
    }
    return null;
  }

  static scopeName: string = undefined;
  static packageNameToStackName(packageName: string) {
    if (!packageName.replace) {
      const e = new Error();
      CenvLog.single.catchLog(e);
    }
    if (packageName === 'GLOBAL' || packageName === 'root') {
      return packageName;
    }
    if (this.scopeName) {
      // language=JSRegexp format=false
const scopeRegEx = new RegExp(`^(${this.scopeName})/`, '');
      packageName = packageName.replace(scopeRegEx, '')
    }
    return `${process.env.ENV}-${packageName.replace(/-(deploy)$/, '')}`;
  }

  static realPackagesLoaded() {
    let pkgs = Object.values(Package.cache);
    pkgs = pkgs.filter((p: Package) => p.stackName !== 'GLOBAL' && !p.local);
    return pkgs?.length;
  }

  static stackNameToPackageName(stackName: string) {
    if (
      stackName === 'GLOBAL' ||
      stackName === 'root' ||
      stackName === '' ||
      stackName === undefined
    ) {
      return stackName;
    }
    const stackPrefix = `${process.env.ENV}-`;
    if (!stackName.startsWith(stackPrefix)) {
      const badStackName = new Error(
        `stackNameToPackageName likely being called on something that isn't a stack: ${stackName}`,
      );
      Cenv.dashboard.log(badStackName.message, badStackName.stack);
      CenvLog.single.catchLog(badStackName);
    } else if (stackName.substring(stackPrefix.length) === Package.getRootPackageName()) {
      stackName = stackName.substring(stackPrefix.length);
    } else {
      stackName = `${this.scopeName}/${stackName.substring(stackPrefix.length)}`;
    }
    return stackName;
  }

  assertLines(title: string, ...text: string[]) {
    const intro = `[${this.packageName}] ${title}: `;
    CenvLog.single.catchLog(
      new Error(text.map((t) => `${intro}${t}\n`).join('')),
    );
  }

  assert(title: string, ...text: string[]) {
    const intro = `[${this.packageName}] ${title}: `;
    CenvLog.single.catchLog(new Error(`${intro}${text.join(' ')}`));
  }

  verbose(...text : string[]) {
    this.mouth?.verbose(...text);
  }

  info(...text : string[]) {
    this.mouth?.info(...text);
  }

  err(...text: string[]) {
    this.mouth?.err(...text);
  }

  alert(...text: string[]) {
    this.mouth?.alert(...text);
  }

  std(...text: string[]) {
    try {
      this.mouth?.std(...text);
    } catch(e) {
      console.log('std error', e)
    }
  }

  stdPlain(...text: string[]) {
    try {
      this.mouth?.stdPlain(...text);
    } catch(e) {
      console.log('std plain error', e)
    }
  }

  static getCurrentVersion(dir: string, isRoot = false) {
    const pkgPath = path.resolve(dir, isRoot ? 'lerna.json' : 'package.json');
    if (existsSync(pkgPath)) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require(pkgPath).version;
    }
    return undefined;
  }

  static getVersion(dir: string, isRoot = false) {
    const pkgPath = path.resolve(dir, isRoot ? 'lerna.json' : 'package.json');
    if (existsSync(pkgPath)) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require(pkgPath).version;
    }
    return undefined;
  }

  static getVersions(dir: string, isRoot = false) {
    const pkgPath = path.resolve(dir, isRoot ? 'lerna.json' : 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = require(pkgPath);
      return {
        version: pkg.version,
        currentVersion: pkg.currentVersion,
        buildVersion: pkg.buildVersion,
        versionHash: pkg.versionHash,
        currentHash: pkg.currentHash,
        buildHash: pkg.buildHash,
      };
    }
    return undefined;
  }

  static getPackages(applications?: string[]) {
    if (applications) {
      return applications?.map((a) => Package.fromPackageName(a));
    }
    return Object.values(Package.cache).filter(
      (p: Package) => p.packageName !== 'GLOBAL',
    );
  }

  static getPackage(stackName: string) {
    if (!stackName || stackName === '') return;
    return Package.fromStackName(stackName);
  }

  static getPackageFromVis(stackNameVis: string) {
    if (!stackNameVis || stackNameVis === '') return;
    const visMatches = Object.values(Package.cache).filter((p: Package) => stackNameVis === p.stackNameVis);

    if (visMatches.length === 1) {
      return visMatches[0];
    } else if (visMatches.length > 1) {
      CenvLog.single.catchLog(new Error(`stackNameVis ${stackNameVis} matches more than one package.. consider setting the Package.stackNameMaxVisibleLength higher than ${Package.stackNameMaxVisibleLength} or name your packages more uniquely`))
    } else {
      CenvLog.single.catchLog(new Error(`stackNameVis ${stackNameVis} does't match any packages.. this should be possible`));
    }
  }

  get deployedVersion(): string | false {
    if (!this.stack?.deployedVersion) {
      return false;
    }
    return this.stack?.deployedVersion;
  }

  static getPackageName(packagePath?: string) {
    if (!packagePath) {
      packagePath = './';
    }
    const pkgPath = path.join(packagePath, './package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      return pkg.name;
    }
  }

  static getRootPackageName() {
    const monoRepoRoot = getMonoRoot();
    return this.getPackageName(monoRepoRoot);
  }


  async pkgCmd(
    cmd: string,
    options: {
      envVars?: any;
      cenvVars?: any;
      pkgCmd?: PackageCmd;
      redirectStdErrToStdOut?: boolean;
      failOnError?: boolean;
      packageModule?: PackageModule;
      returnOutput?: boolean;
      silent?: boolean;
      commandEvents?: CommandEvents
    } = {
      envVars: {},
      cenvVars: {},
      redirectStdErrToStdOut: false,
      returnOutput: false
    }
  ) {
    try {
      const pkgCmd = !options.silent ? this.createCmd(cmd) : undefined;
      options.pkgCmd = pkgCmd;


      const pkgPath = options?.packageModule ? options.packageModule.path : packagePath(this.packageName);

      if (!options.silent) {
        if (!Cenv.dashboard && process.env.CENV_LOG_LEVEL === 'VERBOSE') {
          pkgCmd.out(cmd + ' [started]', 'pkgCmd')
        }
        pkgCmd.info(`[${cmd}] cd ${colors.infoBold(pkgPath)}`);
      }

      if (!options.failOnError) {
        options.failOnError = false;
      }

      const res = await spawnCmd(
        pkgPath,
        cmd,
        cmd,
        options,
        this,
      );


      pkgCmd.result(res);
      return res;
    } catch (e) {
      this.err(e || e.stack);
      if (options.failOnError) {
        throw e;
      }
      return e;
    }
  }

  async pkgShell(
    cmd: string,
    options: {
      envVars?: any;
      cenvVars?: any;
      pkgCmd?: PackageCmd;
      redirectStdErrToStdOut?: boolean;
      failOnError?: boolean;
      packageModule?: PackageModule;
      output?: boolean;
    } = {
      envVars: {},
      cenvVars: {},
      redirectStdErrToStdOut: false,
      output: false,
    }
  ) {
    try {
      const pkgCmd = this.createCmd(cmd);
      const pkgPath = options?.packageModule ? options.packageModule.path : packagePath(this.packageName);
      pkgCmd.out(`[${cmd}] cd ${colors.infoBold(pkgPath)}`);
      options.pkgCmd = pkgCmd;
      if (!options.failOnError) {
        options.failOnError = false;
      }
      const res = await execCmd(
        options.packageModule ? options.packageModule.path : pkgPath,
        pkgCmd.cmd,
        pkgCmd.cmd,
        options.envVars,
        false,
        false,
        this,
      );
      return res;
    } catch (e) {
      this.err('e ' + e.stack);
      return e;
    }
  }

  static async pkgCmd(
    pkg: Package,
    cmd: string,
    options: {
      envVars?: any;
      cenvVars?: any;
      pkgCmd?: PackageCmd;
    } = { envVars: {}, cenvVars: {} },
  ): Promise<any> {
    CenvLog.single.catchLog(new Error(util.inspect(pkg.pkgCmd)));
    const pkgCmd = await pkg?.pkgCmd(cmd, options);
    return pkgCmd;
  }

  printEnvVars(vars: Record<string, string>) {
    for (let i = 0; i < Object.keys(vars).length; i++) {
      this.stdPlain(`export ${vars[Object.keys(vars)[i]]}=${Object.keys(vars)[i]}`);
    }
  }
}
