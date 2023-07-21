import {Package, TPackageMeta} from './package';
import semver, {SemVer} from 'semver';
import {writeFileSync} from 'fs';
import path from 'path';
import {CenvLog, Mouth,} from '../log';

export enum PackageModuleType {
  PARAMS = 'PARAMS', DOCKER = 'DOCKER', STACK = 'STACK', LIB = 'LIB', EXEC = 'EXEC'
}

export interface IPackageModule {
  name?: string;
  path: string;
  version?: SemVer;
  buildVersion?: SemVer;
  currentVersion?: SemVer;
  versionHash?: string;
  buildHash?: string;
  currentHash?: string;
  uri?: string;
  pkg: Package;
  status?: PackageStatus;
  checked?: boolean;
}

export interface PackageStatus {
  incomplete: string[];
  deployed: string[];
  needsFix: string[];
}

export enum ProcessMode {
  DEPLOY = 'DEPLOY', DESTROY = 'DESTROY', SYNTH = 'SYNTH'
}

export abstract class PackageModule implements IPackageModule {
  name: string;
  path: string;
  version: SemVer;
  buildVersion?: SemVer;
  currentVersion?: SemVer;
  versionHash?: string;
  buildHash?: string;
  currentHash?: string;
  uri?: string;
  pkg: Package;
  checked? = false;
  needsFix?: string[];
  incomplete? = false;
  cleanDeps = false;
  fixedDeps = false;
  removedDeps: any[] = [];
  depCheckReport: string = null;
  mouth: Mouth;
  status: PackageStatus = {needsFix: [], deployed: [], incomplete: []};
  meta: TPackageMeta;

  readonly _type: PackageModuleType;

  protected constructor(module: IPackageModule, moduleType: PackageModuleType) {
    this.path = module.path;
    this.pkg = module.pkg;

    module = {...module, ...this.pkg.meta.metas[this.path]};

    this.name = module.name;
    this.version = module.version;
    this.buildVersion = module.buildVersion;
    this.currentVersion = module.currentVersion;

    this.versionHash = module.versionHash;
    this.buildHash = module.buildHash;
    this.currentHash = module.currentHash;
    this.checked = false;
    this._type = moduleType;

    this.meta = this.pkg.meta.metas[this.path];
    this.pkg.meta.addModule(this, this.path);
    this.createMouth(moduleType, this.pkg.stackName);
  }

  abstract get moduleStrings(): string[];

  get type(): PackageModuleType {
    return this._type;
  }

  abstract get anythingDeployed(): boolean;

  get statusDetail(): string {
    if (this.fixedDeps) {
      return this.statusLine('up to date', `removed dependencies [${this.removedDeps.join(', ')}`, false,);
    }

    if (this.cleanDeps) {
      return this.statusLine('up to date', `dependencies validated and confirmed solid by [depcheck]`, false,);
    }

    return this.statusLine('invalid dependencies', `depcheck report:\t${this.depCheckReport}`, true,);
  }

  get moduleBaseStrings(): string[] {
    const items = [];
    items.push(`version: v${this.version}`);
    if (this.buildVersion) {
      items.push(`build version: v${this.buildVersion}`);
    }
    if (this.currentVersion) {
      items.push(`current version: v${this.currentVersion}`);
    }

    if (this.pkg?.stackVersion && this.version !== semver.parse(this.pkg.stackVersion)) {
      items.push(`deployed version: v${this.pkg.stackVersion}`);
    }
    return items;
  }

  get moduleInfo(): string[] {
    const moduleItems = this.moduleStrings;
    moduleItems.push(`path: ${this.path}`);
    return moduleItems;
  }

  abstract statusIssues(): void;

  abstract reset(): void;

  abstract getDetails(): void;

  abstract checkStatus(): Promise<void>;

  abstract upToDate(): boolean;

  abstract printCheckStatusComplete(): void;

  createMouth(noun: string, stackName: string) {
    this.mouth = new Mouth(noun, stackName);
  }

  bump(type: string) {
    const pkgPath = path.join(this.path, 'package.json');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkgJson = require(pkgPath);
    if (type === 'reset') {
      delete pkgJson.buildVersion;
      delete pkgJson.currentVersion;
      delete pkgJson.currentHash;
      delete pkgJson.buildHash;
      writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2));
      return;
    }

    if (this.pkg?.meta?.data.currentHash && this.pkg?.meta?.data.currentHash !== (pkgJson?.buildHash || pkgJson?.versionHash)) {
      pkgJson.currentHash = this.pkg.meta.data.currentHash;
      pkgJson.currentVersion = this.pkg.meta.data.currentVersion;
      if (!this.currentVersion && pkgJson.currentHash) {
        delete pkgJson.currentHash;
      }
      pkgJson.buildVersion = this.pkg.meta.data.buildVersion;
      if (!this.buildVersion && pkgJson.buildHash) {
        delete pkgJson.buildHash;
      }
      writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2));
    }
  }

  bumpComplete() {
    const pkgPath = path.join(this.path, 'package.json');
    const pkgJson = require(pkgPath);
    const bHash = pkgJson?.buildHash;
    const cHash = pkgJson?.currentHash;
    if (!bHash || !cHash || bHash !== cHash) {
      pkgJson.buildHash = cHash;
      pkgJson.buildVersion = pkgJson?.currentVersion;
      writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2));
    }
  }

  statusLineBase(title: string, description: string, colorCombo: any) {
    const regex = /\[(.*?)]/gm;
    let m;
    let newDesc = description;
    while ((m = regex.exec(description)) !== null) {
      if (m.index === regex.lastIndex) {
        regex.lastIndex++;
      }
      newDesc = newDesc.replace(m[0], `${colorCombo.highlight(m[1])}`);
    }

    return `[${colorCombo.bold(this.type)}] ${colorCombo.highlight(title)}: ${colorCombo.bold(newDesc)}`;
  }

  printCheckStatusStart(): void {
    // this.mouth.info('check status');
  }

  statusLine(title: string, description: string, issue: boolean) {
    const color = issue ? CenvLog.colorType('incomplete') : CenvLog.colorType('deployed');
    return this.statusLineBase(title, description, color);
  }

  statusLineType(title: string, description: string, type: string) {
    const color = CenvLog.colorType(type);
    return this.statusLineBase(title, description, color);
  }

  versionMismatch(compareVersion: string) {
    const versionMismatch = `the latest deployed version is [${compareVersion}] your local build is at version [${this.pkg.rollupVersion}]`;
    if (semver.parse(compareVersion) < this.pkg.rollupVersion) {
      return this.statusLine('old version deployed', versionMismatch, true);
    } else if (semver.parse(compareVersion) > this.pkg.rollupVersion) {
      return this.statusLine('newer version deployed', versionMismatch, true);
    }
  }

  async depCheck() {
    await this.pkg.pkgCmd(`yarn remove $(depcheck --json | jq -r '[.dependencies[]]|join(" ")')`,);
  }

  verbose(...text: string[]): void {
    this.mouth.verbose(...text)
  }

  info(...text: string[]): void {
    this.mouth.info(...text)
  }

  alert(...text: string[]): void {
    this.mouth.alert(...text)
  }

  err(...text: string[]): void {
    this.mouth.err(...text)
  }

  std(...text: string[]): void {
    this.mouth.std(...text)
  }
}
