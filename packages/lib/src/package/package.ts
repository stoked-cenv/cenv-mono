import { removeScope, semVerParse, Timer } from '../utils';
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { PackageModule, PackageModuleType, PackageStatus } from './module';
import { CenvLog, LogLevel, Mouth } from '../log';
import { coerce, inc, parse, SemVer } from 'semver';
import { ParamsModule } from './params';
import { DockerModule } from './docker';
import { StackModule } from './stack';
import { BaseCommandOptions, Cenv } from '../cenv';
import { AppVarsFile, CenvFiles, EnvVarsFile } from '../file';
import { LibModule } from './lib';
import { ExecutableModule } from './executable';
import { Deployment } from '../deployment';
import * as util from 'util';
import { spawnCmd, execCmd } from '../proc';

//const envVars = validateEnvVars(['CDK_DEFAULT_ACCOUNT', 'ENV', 'AWS_REGION', 'CENV_BUILD_TYPE',])

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
  SKIPPED = 'SKIPPED',
  HASHING = 'HASHING',
  BUMP = 'BUMP',
  STATUS_CHK = 'STATUS_CHK',
  HAS_PREREQS = 'HAS_PREREQS',
  READY = 'READY',
  BUILDING = 'BUILDING',
  PROCESSING = 'PROCESSING',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
  COMPLETED = ' ',
}

function cmdResult(pkg: Package, cmd: string, failOnError: boolean, code: number, message?: string | string[], minOut?: string, silent = false): boolean {

  let completeMsg = '';
  if (message) {
    completeMsg = (Array.isArray(message) ? message.join(' ') : message) + ' - ';
  }

  if (code === 0) {
    if (!silent) {
      pkg?.std(`${completeMsg}exit code - ${code} [SUCCESS]`, cmd);
    }
    return true;
  }
  if (!silent) {
    if (CenvLog.logLevel === LogLevel.MINIMAL && minOut !== '') {
      pkg?.err('xxx' + minOut);
    }

    pkg.err(`${completeMsg}exit code - ${code} [FAILED]`, cmd);
  }
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
  relativePath = './';
  res;
  stdout?: string;
  stderr?: string;
  silent = false;

  constructor(cmd: string, relativePath = './', code?: number, message?: string, silent = false) {
    this.cmd = cmd;
    this.relativePath = relativePath;

    this.silent = silent || PackageCmd.silent;
    if (code) {
      this.code = code;
      this.res = cmdResult(Package.global, cmd, false, code, message, undefined, silent);
    } else {
      if (!silent) {
        CenvLog.single.stdLog(cmd);
      }
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
    return cmdResult(Package.global, this.cmd, false, code, message, undefined, this.silent);
  }
}

export class PackageCmd implements Cmd {
  cmd: string;
  relativePath = './';
  stdout? = '';
  stderr? = '';
  vars: { [key: string]: string } = {};
  code?: number;
  failOnError = true;
  stackName: string;
  index: number;
  active = true;
  alwaysScroll = true;
  pkg: Package;
  scrollPos = 0;
  res;
  minOut = '';
  cmds: PackageCmd[] = [];
  silent = false;
  static silent = false;

  constructor(pkg: Package, cmd: string, relativePath = './', code?: number, message?: string, failOnError = true, silent = false) {
    this.stackName = pkg?.stackName;
    this.cmd = cmd;
    this.relativePath = relativePath;
    this.pkg = pkg;
    this.silent = silent || PackageCmd.silent;

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
      this.res = cmdResult(pkg, cmd, failOnError, code, message, undefined, silent);
    }
  }

  get running() {
    return this.code === undefined;
  }

  static createCmd(cmd: string, relativePath: string, code?: number, message?: string): Cmd {
    if (Cenv.dashboard) {
      return Package.fromPackageName('GLOBAL').createCmd(cmd, relativePath, code, message);
    }
    return new LogCmd(cmd, relativePath, code, message);
  }

  ensureCommand() {
    if (!this.running) {
      this.pkg.createCmd('log');
    }
  }

  out(...message: string[]) {
    this.ensureCommand();
    this.minOut += message.join(' ') + '\n';
    if (!this.silent) {
      this.pkg.std(...message);
    }
  }

  info(...message: string[]) {
    this.ensureCommand();
    this.minOut += message.join(' ') + '\n';
    if (!this.silent) {
      this.pkg.info(...message);
    }
  }

  err(...message: string[]) {
    this.ensureCommand();
    if (!this.silent) {
      this.pkg.err(...message);
    }
  }

  result(code: number, message?: string | string[]) {
    if (this.res) {
      return this.res;
    }
    this.ensureCommand();
    this.res = cmdResult(this.pkg, this.cmd, this.failOnError, code, message, this.minOut, this.silent);
    this.code = code;
    if (this.index > 0) {
      const prevCmd = this.pkg.cmds[this.index - 1];
      //if (prevCmd.res === this.res && prevCmd.cmd === this.cmd && prevCmd.code === this.code && prevCmd.stderr === this.stderr && prevCmd.stdout === this.stdout) {
        //this.pkg.cmds.splice(this.index - 1, 1);
      //}
    }
    return this.res;
  }
}

export type CenvModuleMeta = CenvDockerMeta | CenvLibMeta | CenvStackMeta;

export interface CenvStackMeta {
  package: string, buildPath?: string
  assignedSubDomain?: string
  certArnName?: string
  clearContext: boolean;
}

export interface CenvDockerMeta {
  context: string;
  file: string;
}

export interface CenvLibMeta {
  loadVars: boolean;
  publish: boolean;
}

export interface CenvMeta {
  stack?: CenvStackMeta;
  stackTemplatePath?: string;
  docker?: CenvDockerMeta;
  lib?: CenvLibMeta;
}

export type TPackageMeta = {
  dockerBaseImage?: string;
  deployDependencies?: Package[];
  destroyDependencies?: Package[];
  dependencies?: { [key: string]: string };
  deployDependencyNames?: string[];
  destroyDependencyNames?: string[];
  dependencyDelay?: string;
  preBuildScripts?: string[];
  postBuildScripts?: string[];
  preDeployScripts?: string[];
  postDeployScripts?: string[];
  versionHashDir?: string;
  versionHash?: string;
  buildHash?: string;
  currentHash?: string;
  currentVersion?: SemVer;
  buildVersion?: SemVer;
  version: SemVer;
  name: string;
  verifyStack?: string;
  deployStack?: string;
  destroyStack?: string;
  executables?: { exec: string, installed: boolean }[];
  url?: string;
  skipDeployBuild: boolean;
  bin?: any;
  scripts?: any;
  cenv?: CenvMeta;
}

export interface IPackageMeta {
  data: TPackageMeta;
}

export class PackageMeta implements IPackageMeta {
  data: TPackageMeta;

  constructor(packagePath: string) {
    this.data = PackageMeta.load(packagePath);
  }

  static load(packagePath: string) {

    const pkgPath = path.join(packagePath, 'package.json');
    const projectPath = path.join(packagePath, 'project.json');
    const pkgExists = existsSync(pkgPath);
    const projectExists = existsSync(projectPath);
    if (!pkgExists) {
      return {
        name: 'GLOBAL',
        version: new SemVer('0.0.0'),
        skipDeployBuild: false
      };
    }

    let data;
    if (pkgExists) {
      const pkgMeta = require(pkgPath);
      data = { ...pkgMeta };
      data.deployDependencies = pkgMeta?.deployDependencies ? pkgMeta?.deployDependencies.map((dep: string) => Package.fromPackageName(dep)) : [];
      data.destroyDependencies = pkgMeta?.destroyDependencies ? pkgMeta?.destroyDependencies.map((dep: string) => Package.fromPackageName(dep)) : [];
      data.preBuildScripts = pkgMeta?.preBuildScripts ? pkgMeta?.preBuildScripts : [];
      data.postBuildScripts = pkgMeta?.postBuildScripts ? pkgMeta?.postBuildScripts : [];
      data.preDeployScripts = pkgMeta?.preDeployScripts ? pkgMeta?.preDeployScripts : [];
      data.postDeployScripts = pkgMeta?.postDeployScripts ? pkgMeta?.postDeployScripts : [];
    }
    if (projectExists) {
      const projectMeta = require(projectPath);
      data = { ...data, ...projectMeta };
    }
    return data;
  }
}

export class PackageMetaConsolidated extends PackageMeta {

  // used to reference modules to metas
  // Record<moduleType, packagePath>
  modules: Record<string, string> = {};

  // Record<packagePath, meta>
  metas: Record<string, TPackageMeta> = {};

  constructor(packagePath: string) {
    super(packagePath);

    if (this.metas[packagePath]) {
      return;
    }

    this.metas[packagePath] = this.data;
  }

  merge(packagePath: string) {
    const dep = PackageMeta.load(packagePath);

    this.metas[packagePath] = dep;

    const data = this.data as TPackageMeta;
    data.deployDependencies = data.deployDependencies ? data.deployDependencies.concat(dep.deployDependencies) : undefined;
    data.destroyDependencies = data.destroyDependencies ? data.destroyDependencies.concat(dep.destroyDependencies) : undefined;
    data.preBuildScripts = data.preBuildScripts ? data.preBuildScripts.concat(dep?.preBuildScripts) : undefined;
    data.postBuildScripts = data.postBuildScripts ? data.postBuildScripts.concat(dep?.postBuildScripts) : undefined;
    data.preDeployScripts = data.preDeployScripts ? data.preDeployScripts.concat(dep?.preDeployScripts) : undefined;
    data.postDeployScripts = data.postDeployScripts ? data.postDeployScripts.concat(dep?.postDeployScripts) : undefined;
    data.dependencies = { ...data.dependencies, ...dep?.dependencies };
    data.bin = { ...data.bin, ...dep.bin };
    this.data = { ...dep };
    return dep;
  }

  addModule(module: PackageModule, packagePath: string) {
    this.modules[module.constructor.name] = packagePath;
    if (this.metas[packagePath].bin) {
      this.data.bin = this.data.bin ? this.data.bin : {};
      this.data.bin[packagePath] = this.metas[packagePath].bin;
    }
    this.data.scripts = this.data.scripts ? this.data.scripts : {};
    this.data.scripts[packagePath] = this.metas[packagePath].scripts;
  }
}

export interface PkgSummary {
  stackName: string,
  processStatus: ProcessStatus;
  environmentStatus: EnvironmentStatus;
  timer: string | undefined;
  type: string;
  version: string;
  statusTime?: number;
}

export interface IPackage {
  name: string;
  stackName: string;
  fullType?: string;
  params?: ParamsModule;
  docker?: DockerModule;
  stack?: StackModule;
  lib?: LibModule;
  exec?: ExecutableModule;
  meta?: PackageMetaConsolidated;
  statusTime?: number;
  processStatus: ProcessStatus;
  environmentStatus: EnvironmentStatus;
  timer?: Timer;

  cmds: PackageCmd[];
  isGlobal: boolean;
  isRoot: boolean;
  activeCmdIndex: number;
  activeModuleIndex: number;
  modules: PackageModule[];
  cenvVars?: any;
  skipUI?: boolean;

  links: string[];
  primaryLink?: string;
  local: boolean;
  root: boolean;
}

export interface CommandEvents {
  preCommandFunc?: () => Promise<void>,
  postCommandFunc?: (pkgCmd?: PackageCmd) => Promise<void>
  failureCommandFunc?: () => Promise<void>
}

export interface PackageNameComponents {
  complete: string,
  scope?: string,
  name: string,
  component?: string,
  instance?: string,
  packageName: string
}

export interface EnvPackageSummary { name: string, version: SemVer, status: string, modules:string[] }

export class Package implements IPackage {
  static loading = true;
  static deployment: any;
  static callbacks: any = {};
  public static maxVisibleLength = 29;
  public static cache: { [stackName: string]: Package } = {};

  name: string;
  fullType = 'pkg';
  stackName: string;
  params?: ParamsModule;
  docker?: DockerModule;
  stack?: StackModule;
  lib?: LibModule;
  exec?: ExecutableModule;
  statusTime?: number;
  processStatus = ProcessStatus.NONE;
  environmentStatus = EnvironmentStatus.NONE;
  environmentStatusReal = EnvironmentStatus.NONE;
  isGlobal = false;
  isRoot = false;
  modules: PackageModule[] = [];
  cenvVars?: any;
  // app config
  links: string[] = [];
  primaryLink?: string;
  local = false;
  root = false;
  invalid = false;
  status: PackageStatus = { incomplete: [], deployed: [], needsFix: [] };
  statusCheckComplete = false;
  skipUI = false;
  skipDeployBuild = false;
  broken? = false;
  notComplete? = false;
  brokenText = '';
  packageModules: { [packageName: string]: PackageModule } = {};
  deploymentBlocked? = false;
  mouth?: Mouth;
  meta: PackageMetaConsolidated;
  deployDependencies?: Package[];
  deployDependenciesRemaining?: Package[];
  activeCmdIndex = -1;
  activeModuleIndex = 0;
  timer?: Timer = undefined;
  cmds: PackageCmd[] = [];
  packageNameComponents: PackageNameComponents;
  NextPollConfigurationToken?: string;
  MetaNextPollConfigurationToken?: string;

  constructor(packageName: string, useCache = true, local = false) {
    const isGlobal = packageName === 'GLOBAL';
    this.local = local;
    this.packageNameComponents = Package.parsePackageName(packageName);
    this.stackName = Package.packageNameToStackName(packageName);
    this.name = this.stackName.replace(CenvFiles.ENVIRONMENT + '-', '');
    CenvLog.single.verboseLog('load packageName: ' + packageName, this.stackName, true);

    if (useCache) {
      const pkg = Package.cache[this.stackName];
      if (pkg) {
        CenvLog.single.catchLog(`attempting to load ${packageName} after it has already been loaded`);
        process.exit(663);
      }
    }

    try {
      const isRoot = this.package === Package.getRootPackageName();
      let pkgPath;
      if (isRoot || isGlobal) {
        pkgPath = CenvFiles.getGuaranteedMonoRoot();
      } else {
        pkgPath = CenvFiles.packagePath(this.package);
        if (!pkgPath) {
          pkgPath = CenvFiles.packagePath(this.package, __dirname);
        }
      }

      if (!pkgPath && !isGlobal) {
        CenvLog.single.catchLog(`could not load package: ${this.codifiedNameVis}`);
        process.exit(34);
      }

      if (pkgPath) {
        this.fullType = 'pkg';

        this.meta = new PackageMetaConsolidated(pkgPath);
        const pathMeta = this.meta.metas[pkgPath];

        const paramsPackage = existsSync(path.join(pkgPath, AppVarsFile.NAME)) || existsSync(path.join(pkgPath, EnvVarsFile.NAME));
        if (paramsPackage) {
          this.params = new ParamsModule(this, pkgPath, this.meta.data);
        }

        if (existsSync(path.join(pkgPath, './cdk.json')) || pathMeta.deployStack || this.meta?.data?.cenv?.stack || (this.meta?.data?.cenv?.stackTemplatePath && this.component)) {
          this.stack = new StackModule(this, pkgPath, this.meta.data);
        }

        if (existsSync(path.join(pkgPath, './Dockerfile'))) {
          this.docker = new DockerModule(this, pkgPath, this.meta.data);
        }

        if (this.meta?.metas[pkgPath].bin) {
          this.exec = new ExecutableModule(this, pkgPath, this.meta.data);
        }

        if (pathMeta.scripts?.build) {
          this.lib = new LibModule(this, pkgPath, this.meta.data);
        }

        if ((this.docker || this.params || this.lib || this.exec) && !this.stack) {
          const stack = this.addStackModule(pkgPath);
          if (stack) {
            this.stack = stack;
          }
        }
        this.setDependentComponentVolatileKeys();
      } else {
        // global
        this.meta = new PackageMetaConsolidated(CenvFiles.getGuaranteedMonoRoot());
        this.fullType = 'global';
      }

      if (!isGlobal && !this.docker && !this.params && !this.docker && !this.lib && !this.exec) {
        if (!this.local) {
          const errString = `${CenvLog.colors.alertBold(this.codifiedName)} is not a valid package`;
          CenvLog.single.infoLog(errString);
          process.exit();
        }
        this.invalid = true;
        return;
      }

      if (!isGlobal) {
        this.modules = [this.lib, this.exec, this.params, this.docker, this.stack].filter((n) => n) as PackageModule[];
        this.modules.map((m) => {
          this.packageModules[m.name.toString()] = m;
        });
      } else {
        this.modules = [];
      }
      this.ensureModuleVersionConsistency();

      this.statusTime = Date.now();
      this.processStatus = isGlobal ? ProcessStatus.NONE : ProcessStatus.INITIALIZING;
      this.environmentStatus = isGlobal ? EnvironmentStatus.NONE : EnvironmentStatus.INITIALIZING;

      this.isGlobal = isGlobal;
      this.isRoot = isRoot;

      this.mouth = new Mouth(this.stackName, this.stackName);
      this.timer = new Timer(this.stackName, 'seconds');

      if (useCache) {
        Package.cache[this.stackName] = this;
      }
    } catch (e) {
      CenvLog.single.catchLog(e);
      process.exit(3);
    }
  }
  get codifiedName() {
    return this.packageNameComponents.complete;
  }
  get package(): string {
    return this.packageNameComponents.packageName;
  }

  get packageNoScope(): string {
    return this.packageNameComponents.name;
  }

  get instance(): string | undefined  {
    return this.packageNameComponents.instance;
  }

  get component(): string |  undefined {
    return this.packageNameComponents.component;
  }

  static parsePackageName(packageName: string): PackageNameComponents {
    const packageRegExp = new RegExp(/^(@[a-z0-9-~][a-z0-9-._~]*)\/?([a-z0-9-~][a-z0-9-._~]*)?\+?([a-z0-9-~][a-z0-9-._~]*)?@?([a-z0-9-~][a-z0-9-._~]*)?$/);
    let m;

    const componentParts = ['complete', 'scope', 'name', 'component', 'instance'];
    const components: any = {
      complete: packageName,
      name: packageName
    }
    if ((m = packageRegExp.exec(packageName)) !== null) {
      // The result can be accessed through the `m`-variable.
      m.forEach((match, groupIndex) => {
        components[componentParts[groupIndex] as keyof PackageNameComponents] = match;
      });
    }

    components.packageName = components.name;
    if (components.scope) {
      components.packageName = `${components.scope}/${components.name}`;
      components.name = components.name.replace(components.scope, '');
    }

    return components;
  }

  get envSummary(): EnvPackageSummary {
    let res: any = { name: this.name, version: this.moduleVersion, status: this.environmentStatus, modules: Object.values(this.modules).map(m => m.type) };
    delete res.stackName;
    return res;
  }

  static get global(): Package {
    if (Package.cache['GLOBAL']) {
      return Package.cache['GLOBAL'];
    }
    return new Package('GLOBAL');
  }

  get codifiedNameVis(): string {
    return this.codifiedName.substring(0, Package.maxVisibleLength);
  }

  get stackNameFinal() {
    if (this.instance) {
      return `${CenvFiles.ENVIRONMENT}-${this.instanceComponent}`;
    } else if (this.component) {
      return `${CenvFiles.ENVIRONMENT}-${this.component}`;
    }
    return `${CenvFiles.ENVIRONMENT}-${this.packageNoScope}`;
  }

  get bucketName() {
    return `${CenvFiles.ENVIRONMENT}-${this.packageName.replace(/^@/, '').replace(/\//g, '-')}-${process.env.CDK_DEFAULT_ACCOUNT!.slice(5)}`;
  }

  get stackNameVis(): string {
    let stack = this.stackName;
    if (this.component) {
      stack = Package.packageNameToStackName(this.codifiedName);
    }
    return stack.substring(0, Package.maxVisibleLength);
  }

  get type(): string {
    return this.fullType?.split('-')[0];
  }

  public get packageName() {
    return this.isGlobal ? this.stackName : this.packageNameComponents.complete;
  }

  public get path() {
    return this.params?.path || this.docker?.path || this.stack?.path;
  }

  get moduleVersion(): SemVer {
    const modules = this.modules.filter(fm => !!fm.version).map(m => m?.version);
    if (!modules.length) {
      return parse('0.0.0') as SemVer;
    }

    return modules.reduce((a, b) => {
      return this.useHighestVersion(a, b);
    });
  }

  get moduleBuildVersion(): SemVer | undefined {
    const modules = this.modules.filter(fm => !!fm.buildVersion);
    if (!modules.length) {
      return parse('0.0.0') as SemVer;
    }
    return modules.filter(m => m?.buildVersion).map(m => m.buildVersion!).reduce((a, b) => {
      return this.useHighestVersion(a, b);
    });
  }

  get moduleCurrentVersion(): SemVer | undefined {
    const modules = this.modules.filter(fm => !!fm.currentVersion);
    if (!modules.length) {
      return this.moduleVersion as SemVer;
    }
    return modules.filter(fm => !!fm.currentVersion).map(m => m.currentVersion!).reduce((a, b) => {
      return this.useHighestVersion(a, b);
    });
  }

  get rollupVersion(): SemVer {
    return (this.moduleCurrentVersion || this.moduleBuildVersion || this.moduleVersion);
  }

  get needsFix() {
    return this.broken || this.modules.filter(m => m.needsFix).length;
  }

  get incomplete() {
    return this.notComplete || this.modules.filter(m => m.incomplete).length;
  }

  get stackVersion(): string | false {
    if (!this.stack?.stackVersion) {
      return false;
    }
    return this.stack?.stackVersion.toString();
  }

  get summary(): PkgSummary {
    if (this.isGlobal) {
      return {
        stackName: this.stackNameVis,
        version: '-----',
        type: '-----',
        environmentStatus: this.environmentStatus,
        processStatus: this.processStatus,
        timer: this.timer?.elapsed,
      };
    }

    return {
      stackName: this.stackNameVis,
      version: `${this.meta.data.version}`,
      type: this.type,
      environmentStatus: this.environmentStatus,
      processStatus: this.processStatus,
      timer: this.timer?.elapsed,
      statusTime: this.statusTime,
    };
  }

  static getPackageComponent(packageName: string) {
    if (packageName.indexOf('+') > -1) {
      const parts = packageName.split('+');
      if (parts[1].indexOf('@') === -1) {
        return { package: parts[0], component: parts[1] };
      } else {
        const instanceParts = parts[1].split('@');
        return { package: parts[0], component: instanceParts[0], instance: instanceParts[1] };
      }
    }
    return { package: packageName };
  }

  static fromPackageName(packageName: string, local = false): Package {
    if (packageName === 'GLOBAL') {
      return Package.global;
    }

    const packageComponent = Package.getPackageComponent(packageName);
    const pkgs = Object.values(Package.cache).filter((p: Package) => {
      return p.packageName === packageName && p?.component === packageComponent?.component && p?.instance === packageComponent?.instance;
    });
    if (pkgs.length > 1) {
      CenvLog.single.catchLog(new Error(`more than one package found.. this isn't supported.. YET!`));
      process.exit();
    } else if (pkgs.length === 1) {
      return pkgs[0];
    }
    const stackName = Package.packageNameToStackName(packageName);
    if (Package.cache[stackName]) {
      return Package.cache[stackName];
    }
    return new Package(packageName, true, local);
  }

  static fromStackName(stackName: string): Package {
    if (stackName === 'GLOBAL') {
      return Package.global;
    }
    return Package.fromPackageName(Package.stackNameToPackageName(stackName));
  }

  static packageNameToDockerName(packageName: string) {
    return packageName.replace('@', ``).replace(/-(deploy)$/, '');
  }

  static async checkStatus(targetMode?: string, endStatus?: ProcessStatus, silent = false) {
    await DockerModule.dockerPrefight(Object.values(Package.cache), silent);
    for (const p of Object.values(Package.cache)) {
      await p?.checkStatus(targetMode, endStatus, silent);
    }
  }

  get componentInstance() {
    if (!this.instance) {
      return this.component;
    }
    return `${this.component}-${this.instance}`;
  }

  get instanceComponent() {
    if (!this.component) {
      return this.instance;
    }
    return `${this.instance}-${this.component}`;
  }

  static packageNameToPackageComponentInstance(packageName: string): string {
    const parsed = Package.parsePackageName(packageName);
    let packageComponentInstance = parsed.name;
    if (parsed.component) {
      packageComponentInstance += `+${parsed.component}`;
    }
    if (parsed.instance) {
      packageComponentInstance += `@${parsed.instance}`;
    }
    return packageComponentInstance;
  }

  static packageNameToStackName(packageName: string) {

    if (packageName === 'GLOBAL' || packageName === 'root') {
      return packageName;
    }
    const packageComponentInstance = Package.packageNameToPackageComponentInstance(packageName);
    return `${CenvFiles.ENVIRONMENT}-${packageComponentInstance}`;
  }

  static realPackagesLoaded() {
    let pkgs = Package.getPackages();
    pkgs = pkgs.filter((p: Package) => !p.local);
    return pkgs?.length;
  }

  static stackNameToPackageName(stackName: string) {
    if (stackName === '' || stackName === undefined) {
      CenvLog.single.catchLog('stackNameToPackageName called with a stackName was is undefined or an empty string');
      process.exit(238);
    }

    if (stackName === 'GLOBAL') {
      return stackName;
    }
    if (!Package.cache[stackName]) {
      const badStackName = new Error(`stackNameToPackageName being called before the Package has been initialized: ${stackName}`);
      CenvLog.single.catchLog(badStackName);
      process.exit(238);
    }

    return Package.cache[stackName].packageName;
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

  static getPackages(includeGlobal = false) {
    const pkgs = Object.values(Package.cache);
    if (includeGlobal) {
      return pkgs;
    }
    return pkgs.filter((p: Package) => !p.isGlobal);
  }

  static getPackageFromVis(stackNameVis: string) {
    if (!stackNameVis || stackNameVis === '') {
      return;
    }
    const visMatches = Object.values(Package.cache).filter((p: Package) => stackNameVis === p.stackNameVis);

    if (visMatches.length === 1) {
      return visMatches[0];
    } else if (visMatches.length > 1) {
      //CenvLog.single.catchLog(new Error(`stackNameVis ${stackNameVis} matches more than one package.. consider setting the Package.xaxVisibleLength higher than ${Package.maxVisibleLength} or name your packages more uniquely`))
    } else {
      //CenvLog.single.catchLog(new Error(`stackNameVis ${stackNameVis} does't match any packages.. this should be possible`));
    }
    return false;
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
    const monoRepoRoot = CenvFiles.getGuaranteedMonoRoot();
    return this.getPackageName(monoRepoRoot);
  }

  static getRootPackagePath() {
    const monoRepoRoot = CenvFiles.getGuaranteedMonoRoot();
    return path.join(monoRepoRoot, './package.json');
  }

  static async pkgCmd(pkg: Package, cmd: string, options: {
    envVars?: any; cenvVars?: any; pkgCmd?: PackageCmd;
  } = { envVars: {}, cenvVars: {} }): Promise<any> {
    CenvLog.single.catchLog(new Error(util.inspect(pkg.pkgCmd)));
    const pkgCmd = await pkg?.pkgCmd(cmd, options);
    return pkgCmd;
  }

  setDependentComponentVolatileKeys() {
    const clearContext = this.meta?.data?.cenv?.stack?.clearContext;
    if (!clearContext) {
      this.meta.data.deployDependencies?.map((p: Package) => {
        if (p.component && p?.meta?.data?.cenv?.stack) {
          if (p.meta?.data?.cenv?.stack?.clearContext) {
            p.meta.data.cenv.stack.clearContext = true;
          }
        }
      });
    }
  }

  setBroken(brokenText: string, deploymentBlocked = false) {
    this.brokenText = brokenText;
    this.broken = true;
    if (deploymentBlocked) {
      this.deploymentBlocked = deploymentBlocked;
    }
  }

  addStackModule(pkgPath: string) {
    const deployPath = path.join(pkgPath, 'deploy');
    const cdkPath = path.join(deployPath, './cdk.json');
    const hasDeploy = existsSync(deployPath) && existsSync(cdkPath);

    if (hasDeploy) {
      const meta = this.meta.merge(deployPath);
      return new StackModule(this, deployPath, meta);
    }
    return false;
  }

  isParamDeploy(options?: any) {
    return this.params && options?.parameters && !Deployment.options.none && this.params?.hasCenvVars && options?.parameters && (!options?.strictVersions || !this.params.upToDate());
  }

  isDockerDeploy(options?: any) {
    return this.docker && options?.docker && !Deployment.options.none && (!options?.strictVersions || !this.docker.upToDate());
  }

  isStackDeploy(options?: any) {
    return this.stack && options?.stack && !Deployment.options.none && (!options?.strictVersions || !this.stack.upToDate());
  }

  isLibDeploy(options?: any) {
    return this.lib && options?.lib && !Deployment.options.none;
  }

  isExecDeploy(options?: any) {
    return this.exec && options?.exec && !Deployment.options.none;
  }

  isParamDestroy(options?: any) {
    return this.params?.hasCenvVars && options?.parameters && this.params.anythingDeployed;
  }

  isDockerDestroy(options?: any) {
    return this.docker && options?.docker && this.docker.anythingDeployed;
  }

  isStackDestroy(options?: any) {
    return this.stack && options?.stack && this.stack.anythingDeployed;
  }

  async destroy(deployOptions: any) {

    if (this.isStackDestroy(deployOptions)) {
      await this.stack?.destroy();
    }

    if (this.isDockerDestroy(deployOptions)) {
      await this.docker?.destroy();
    }

    if (this.isParamDestroy(deployOptions)) {
      await this.params?.destroy();
    }
  }

  async deploy(deployOptions: any) {
    try {
      const options: any = {
        failOnError: true, envVars: {
          CENV_LOG_LEVEL: deployOptions.logLevel, CENV_DEFAULTS: 'true',
        },
      };

      if (this.isParamDeploy(deployOptions)) {
        await this.params?.deploy(options);
      }

      if (this.isLibDeploy(deployOptions)) {
        await this.lib?.deploy();
      }

      if (this.isExecDeploy(deployOptions)) {
        await this.exec?.link();
      }

      if (this.isDockerDeploy(deployOptions)) {
        await this.docker?.deploy(options);
      }

      if (this.isStackDeploy(deployOptions)) {
        await this.stack?.deploy(deployOptions, options);
      }
    } catch (ex) {
      if (ex instanceof Error) {
        CenvLog.single.errorLog(ex?.stack as string, this.stackName, true);
      }
      throw ex;
    }
  }

  async depCheck() {
    await Promise.all(this.getPackageModules().map(async (packageModule: PackageModule) => {

      const unusedDeps = await this.execCmd(`depcheck --json | jq -r '[.dependencies[]]|join(" ")'`, { packageModule });

      if (unusedDeps && (unusedDeps as string).trim() !== '') {
        const depCheckRes = await this.pkgCmd(`yarn remove ${unusedDeps.trim()}`, {
          packageModule,
        });

        if (depCheckRes) {
          this.setBroken(`[${packageModule.name}] depcheck failed`);
          return;
        }
      }
    }));
  }

  getPackageModuleNames() {
    return Object.keys(this.packageModules);
  }

  getPackageModules(): PackageModule[] {
    const packageNames = this.getPackageModuleNames();
    return packageNames.map(pn => this.packageModules[pn]);
  }

  async install() {
    await Promise.all(this.getPackageModules().map(async (packageModule: PackageModule) => {
      const depCheckRes = await this.pkgCmd(`yarn install`, {
        packageModule,
      });

      if (depCheckRes) {
        this.setBroken(`[${packageModule.name}] install failed`, true);
        return;
      }
    }));
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
    } else if (this.meta?.data?.url) {
      return this.meta.data.url;
    }
    return `https://${process.env.AWS_REGION}.console.aws.amazon.com`;
  }

  chDir() {
    const pkgPath = CenvFiles.packagePath(this.packageName);
    if (!pkgPath) {
      return false;
    }

    if (process.cwd() !== pkgPath) {
      this.verbose(pkgPath, 'pkg cwd');
      process.chdir(path.relative(process.cwd(), pkgPath));
    }
    return true;
  }

  hasChanged() {
    return this.meta.data.versionHash !== this.meta.data.currentHash;
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
    const pre = parse(this.meta.data.buildVersion) as SemVer;

    if (pre.prerelease[0] !== prerelease) {
      CenvLog.single.catchLog(`[${this.packageName}] attempting to bump in ${process.env.CENV_BUILD_TYPE} mode but prerelease version doesn't match. Expecting ${prerelease} but found ${pre.prerelease[0]} while bumping module ${this.type}.`);
    }
    this.meta.data.version = coerce(pre) as SemVer;
    this.meta.data.buildVersion = undefined;
    this.meta.data.currentVersion = undefined;
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
    if (this.moduleCurrentVersion) {
      this.setVersion('currentVersion', this.moduleCurrentVersion);
    }
    if (this.moduleBuildVersion) {
      this.setVersion('buildVersion', this.moduleBuildVersion);
    }
    this.setVersion('version', this.moduleVersion);
  }

  async processBump(type: string) {
    switch (type) {
      case 'major':
      case 'minor':
      case 'patch':
        this.meta.data.currentVersion = semVerParse(inc(this.rollupVersion, type));
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
            this.meta.data.currentVersion = semVerParse(inc(this.rollupVersion, 'prerelease', 'r'));
            break;
          case 'BETA_PRERELEASE':
            this.meta.data.currentVersion = semVerParse(inc(this.rollupVersion, 'prerelease', 'b'));
            break;
          // considered alpha prerelease by default
          case 'ALPHA_PRERELEASE':
          default:
            this.meta.data.currentVersion = semVerParse(inc(this.rollupVersion, 'prerelease', 'a'));
            break;
        }
        break;
    }
  }

  async bump(type: string) {
    try {
      this.processStatus = ProcessStatus.BUMP;
      if (type === 'reset') {
        this.info(CenvLog.colors.success(`v${this.moduleVersion}`));
        this.modules.map((m) => {
          m.bump(type);
        });
        return;
      }

      this.ensureModuleVersionConsistency();
      if (!this.meta || !this.meta.data.currentHash || this.meta.data.currentHash === (this.meta.data.buildHash || this.meta.data.versionHash)) {
        return;
      }

      if (!process.env.CENV_BUILD_TYPE) {
        process.env.CENV_BUILD_TYPE = 'ALPHA_PRERELEASE';
      }

      const previousVersion = this.moduleVersion;

      this.info('current version', `[${this.rollupVersion}] released version: ${this.moduleVersion}`);

      this.modules.map((m) => {
        m.bump(type);
      });

      const newVersion = this.meta.data.version;
      if (previousVersion === newVersion) {
        return;
      }
      const root = CenvFiles.getGuaranteedMonoRoot();
      const relativePath = path.relative(root, this.path as string);
      this.createCmd(`${this.packageName} trigger upgrade: ${previousVersion} to ${newVersion}`, relativePath, 0);

      const packages = Package.getPackages();

      await Promise.all(packages.map(async (p: Package) => {
        if (p.packageName !== this.packageName && p.meta?.data.dependencies && Object.keys(p.meta?.data.dependencies)?.includes(this.packageName)) {
          await p.bump(type);
        }
      }));
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }

  createCmd(command: string, relativePath?: string, code?: number, message?: string, addToGloalLog = false) {
    try {
      const latestCmdActive = this.cmds ? this.activeCmdIndex === this.cmds.length - 1 : false;
      const cmd = new PackageCmd(this, command, relativePath, code, message);
      if (latestCmdActive) {
        this.activeCmdIndex = this.cmds.length - 1;
      }
      return cmd;
    } catch (e) {
      CenvLog.single.catchLog(e);
      process.exit(3424);
    }
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
        return false;
      case EnvironmentStatus.NEEDS_UPDATE:
        return 'needs to deploy';
      case EnvironmentStatus.UP_TO_DATE:
        return 'latest is fully deployed';
      case EnvironmentStatus.NOT_DEPLOYED:
        return 'not deployed at all';
    }
    return false;
  }

  async finalizeStatus(targetMode?: string, endStatus?: ProcessStatus) {

    this.status = { incomplete: [], needsFix: [], deployed: [] };
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
    });

    this.statusCheckComplete = true;
    if (endStatus) {
      this.processStatus = endStatus;
    } else if (targetMode === 'DEPLOY' || Deployment.mode.toString() === 'DEPLOY') {
      this.processStatus = this.environmentStatus === EnvironmentStatus.UP_TO_DATE ? ProcessStatus.COMPLETED : ProcessStatus.PROCESSING;
    } else if (targetMode === 'DESTROY' || Deployment.mode.toString() === 'DESTROY') {
      this.processStatus = this.environmentStatus === EnvironmentStatus.NOT_DEPLOYED ? ProcessStatus.COMPLETED : ProcessStatus.PROCESSING;
    }
  }

  async checkStatus(targetMode?: string, endStatus?: ProcessStatus, silent = false) {

    let options = '';
    if (CenvLog.isVerbose) {
      if (targetMode) {
        options = ` --target-mode ${targetMode}`;
      }

      if (endStatus) {
        options += ` --end-status ${Object.keys(ProcessStatus)[Object.values(ProcessStatus).indexOf(endStatus)]}`;
      }
    }

    const cmd = this.createCmd(`cenv stat ${this.packageName}${options}`);
    this.resetStatus();
    await this.checkModuleStatus(silent);
    await this.finalizeStatus(targetMode, endStatus);
    cmd.result(0);
    /*
    await this.pkgCmdFunc(`cenv stat ${this.packageName}${options}`, async (targetMode?: string, endStatus?: ProcessStatus) => {
      this.resetStatus()
      await this.checkModuleStatus();
      await this.finalizeStatus(targetMode, endStatus);
    }, [targetMode, endStatus])

     */
  }

  resetStatus() {
    this.statusCheckComplete = false;
    this.modules.map(m => m.reset());
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

  assertLines(title: string, ...text: string[]) {
    const intro = `[${this.packageName}] ${title}: `;
    CenvLog.single.catchLog(new Error(text.map((t) => `${intro}${t}\n`).join('')));
  }

  assert(title: string, ...text: string[]) {
    const intro = `[${this.packageName}] ${title}: `;
    CenvLog.single.catchLog(new Error(`${intro}${text.join(' ')}`));
  }

  verbose(...text: string[]) {
    this.mouth?.verbose(...text);
  }

  info(...text: string[]) {
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
    } catch (e) {
      console.log('std error', e);
    }
  }

  stdPlain(...text: string[]) {
    try {
      this.mouth?.stdPlain(...text);
    } catch (e) {
      console.log('std plain error', e);
    }
  }

  async pkgCmd(cmd: string, options: {
    envVars?: any;
    cenvVars?: any;
    pkgCmd?: PackageCmd;
    parentCmd?: PackageCmd;
    redirectStdErrToStdOut?: boolean;
    failOnError?: boolean;
    packageModule?: PackageModule;
    returnOutput?: boolean;
    silent?: boolean;
    commandEvents?: CommandEvents;
    pkgPath?: string;
    force?: boolean;
  } = {
    envVars: {}, cenvVars: {}, redirectStdErrToStdOut: false, returnOutput: false, failOnError: true, silent: false,
  }) {
    try {

      if (!options?.pkgPath) {
        const ppath = options?.packageModule ? options.packageModule.path : CenvFiles.packagePath(this.packageName);
        if (!ppath) {
          CenvLog.single.catchLog(new Error(`Package ${this.packageName} not found`));
          process.exit(820);
        }
        options.pkgPath = ppath;
      }

      if (!options.pkgCmd && options.silent !== true) {
        const root = CenvFiles.getGuaranteedMonoRoot();
        const relativePath = path.relative(root, options.pkgPath);
        options.pkgCmd = this.createCmd(cmd, relativePath);
        if (options.parentCmd) {
          options.parentCmd.cmds.push(options.pkgCmd);
        }
      }

      if (options.failOnError === undefined) {
        options.failOnError = true;
      }
      options.pkgCmd?.out(options.pkgPath, cmd);
      const res = await spawnCmd(options.pkgPath, cmd, cmd, options, this);

      if (options.pkgCmd?.running) {
        options.pkgCmd.out('output', res.stdout);

        if (res?.result !== undefined && res.result !== 0 && options.commandEvents?.failureCommandFunc) {
          await options.commandEvents.failureCommandFunc();
        }

        options.pkgCmd?.result(res?.result !== undefined ? res.result : res, res.stdout);
      }

      return res;
    } catch (e) {

      let etype = e?.toString();
      if (e instanceof Error) {
        etype = e.stack?.toString();
        this.alert(e.message);
        if (options.force && e.message.includes('No updates are to be performed')) {
          return {result: 0};
        }
      }
      const error = `pkgCmd failed: ${etype || e} (${cmd})`;
      if (options?.pkgCmd?.res !== undefined) {
        if (options.pkgCmd.code === 0) {
          options.pkgCmd.code = -41;
        }
      } else {
        if (options.pkgCmd) {
          options.pkgCmd.result(Number(e), error);
        } else {
          this.err(error);
        }
      }
      if (options.failOnError) {
        throw e;
      }
      return e;
    }
  }

  async execCmd(cmd: string, options: {
    envVars?: any;
    cenvVars?: any;
    pkgCmd?: PackageCmd;
    redirectStdErrToStdOut?: boolean;
    failOnError?: boolean;
    packageModule?: PackageModule;
    output?: boolean;
    silent?: boolean;
  } = {
    envVars: {}, cenvVars: {}, redirectStdErrToStdOut: false, output: false, silent: false
  }) {
    try {
      const pkgCmd = this.createCmd(cmd);
      const pkgPath = options?.packageModule ? options.packageModule.path : CenvFiles.packagePath(this.packageName);
      if (!pkgPath) {
        CenvLog.single.catchLog(`Package path not found for ${this.packageName}`);
        process.exit(722);
      }
      options.pkgCmd = pkgCmd;
      if (!options.failOnError) {
        options.failOnError = false;
      }

      const res = await execCmd(pkgCmd.cmd, options);
      return res;
    } catch (e) {
      if (e instanceof Error) {
        this.err('e ' + e.stack as string);
      }
      return e as string;
    }
  }

  async pkgCmdFunc(cmd: string, func: (...args: any[]) => any, ...args: any[]) {
    const funcCmd = this.createCmd(cmd);
    const res = await func(...args)();
    funcCmd.result(res === undefined ? 0 : res);
    return res;
  }

  printEnvVars(vars: Record<string, string>) {
    for (let i = 0; i < Object.keys(vars).length; i++) {
      this.stdPlain(`export ${Object.keys(vars)[i]}=${vars[Object.keys(vars)[i]]}`);
    }
  }

  protected async checkModuleStatus(silent = false) {
    //delete this.timer;
    this.processStatus = ProcessStatus.STATUS_CHK;

    if (this.lib) {
      await this.lib?.checkStatus(silent);
    }
    if (this.exec) {
      await this.exec?.checkStatus(silent);
    }
    if (this.params) {
      await this.params?.checkStatus(silent);
    }
    if (this.docker) {
      await this.docker?.checkStatus(silent);
    }
    if (this.stack) {
      await this.stack?.checkStatus(silent);
    }
  }
}
