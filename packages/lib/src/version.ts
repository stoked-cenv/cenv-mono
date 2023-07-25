import * as path from 'path';
import {CenvLog, info, infoAlertBold, infoBold} from './log';
import {Package} from './package/package';
import {eq, lt, parse, RangeOptions, SemVer} from "semver";
import {existsSync, mkdirSync, renameSync, rmdirSync, rmSync, writeFileSync} from "fs";
import {getProfiles, ProfileData,} from "./stdIo";
import { getMonoRoot, getProbableMonoRoot, search_sync, sureParse } from './utils';
import {CenvFiles} from "./file";

export enum BumpMode {
  DISABLED = 'DISABLED',
  ALPHA_PRERELEASE = 'ALPHA_PRERELEASE',
  BETA_PRERELEASE = 'BETA_PRERELEASE',
  RC_PRERELEASE = 'RC_PRERELEASE',
  PATCH = 'PATCH',
  MINOR = 'MINOR',
  MAJOR = 'MAJOR'
}

export interface IVersionFile {
  version: SemVer | string;
  upgradedTs?: number;
  lastTs: number;
  upgrades?: { ts: number, v: string }[];
}

export enum BumpType {
  DISABLED = 'DISABLED', BUMP = 'BUMP', DECREMENT = 'DECREMENT', FINALIZE_PRERELEASE = 'FINALIZE_PRERELEASE'
}

export const bumpTypeID = 'CENV_BUMP_TYPE';
export const bumpModeID = 'CENV_BUMP_MODE';
export const bumpStateID = 'CENV_BUMP_STATE';

export class Version {
  static gitIgnoreFile: string = path.join(`./.gitignore`);
  static lastVersion: SemVer;
  static currentVersion: SemVer;
  static installedVersion: SemVer;
  static nextIncrementVersion: SemVer;
  static versionFileData: IVersionFile;
  static opt: RangeOptions = {includePrerelease: true};
  private static modeKey = 0;
  private static typeKey = 0;

  static get bumpType() {
    const keys: string[] = Object.keys(BumpType)
    const type: BumpType = BumpType[keys[this.typeKey] as BumpType];
    process.env[bumpTypeID] = type;
    return type;
  }

  static get bumpMode() {
    const keys = Object.keys(BumpMode)
    const mode = BumpMode[keys[this.modeKey] as BumpMode];
    process.env[bumpModeID] = mode;
    return mode;
  }

  static get bumpTypeText() {
    return this.textOutput(this.bumpType);
  }

  static get bumpModeText() {
    return this.textOutput(this.bumpMode);
  }

  static get bumpState() {
    process.env[bumpStateID] = `${this.bumpType}_${this.bumpMode}`;
    return process.env[bumpStateID];
  }

  static get bumpStateText() {
    return this.textOutput(this.bumpState);
  }

  static get nextBumpType() {
    if (this.bumpMode === BumpMode.DISABLED) {
      return BumpType.DISABLED;
    }

    const typeKeys = Object.keys(BumpType);
    this.typeKey = this.typeKey + 1 === typeKeys.length ? 1 : this.typeKey + 1;
    let next = BumpType[typeKeys[this.typeKey] as BumpType];
    if (next === BumpType.FINALIZE_PRERELEASE && this.bumpMode.indexOf('PRERELEASE') === -1) {
      this.typeKey = 0;
      next = BumpType[typeKeys[this.typeKey] as BumpType];
    }
    return this.textOutput(next);
  }

  static get nextBumpMode() {
    const modeKeys = Object.keys(BumpMode);
    this.modeKey = this.modeKey + 1 === modeKeys.length ? 0 : this.modeKey + 1;
    let next = BumpMode[modeKeys[this.modeKey] as BumpMode];
    if (next.indexOf('PRERELEASE') === -1 && this.bumpType === BumpType.FINALIZE_PRERELEASE) {
      this.modeKey = 0;
      next = BumpMode[modeKeys[this.modeKey] as BumpMode];
    }
    if (this.bumpType === BumpType.DISABLED) {
      this.setBumpType(BumpType.BUMP);
    }
    return this.textOutput(next);
  }

  static setBumpType(bumpType: BumpType) {
    process.env[bumpTypeID] = bumpType;
  }

  static setBumpMode(bumpMode: BumpMode) {
    process.env[bumpModeID] = bumpMode;
  }

  static async Bump(packages: any, type: string) {
    try {
      CenvLog.single.infoLog(`bump ${packages.length} potential packages: ${type}`)
      await Promise.all(packages.filter((p: Package) => !p.isGlobal).map(async (p: Package) => await p.bump(type)));
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }

  static getLibraryId(packageName: string) {
    return packageName.replace('@stoked-cenv/', '');
  }

  static setEnvVars(packageName: string, libraryId: string) {
    const versionString = `${info(packageName)}: ${infoBold(this.currentVersion)}`;
    if (process.env.CENV_VERSION) {
      process.env.CENV_VERSION += versionString + '\n';
    } else {
      process.env.CENV_VERSION = versionString + '\n';
    }
    process.env['CENV_VERSION_' + libraryId.toUpperCase()] = versionString;
  }

  static async getVersion(packageName: string) {
    let pkgPath = path.join(__dirname, '../');
    const libraryId = this.getLibraryId(packageName);
    const isLib = libraryId === 'lib';
    if (!isLib) {
      pkgPath = path.join(pkgPath, '../', libraryId);
    }
    this.currentVersion = require(path.join(pkgPath, './package.json')).version;
    this.currentVersion = sureParse(this.currentVersion, this.opt);
    const versionFile = path.join(pkgPath, './.version.json');
    this.versionFileData = {
      version: '0.1.0', lastTs: Date.now(),
    };

    if (existsSync(versionFile)) {
      this.versionFileData = require(versionFile);
    }
    this.installedVersion = parse(this.versionFileData.version, this.opt) as SemVer;
    this.lastVersion = this.versionFileData.version as SemVer;
    if (libraryId !== 'lib' || eq(this.currentVersion, this.lastVersion, this.opt)) {
      this.setEnvVars(packageName, libraryId);
      return;
    }
    await this.Upgrade();

    this.incrementVersionFile(this.currentVersion);

    this.setEnvVars(packageName, libraryId);
    writeFileSync(versionFile, JSON.stringify(this.versionFileData, null, 2));
    return this.versionFileData;
  }

  static async Upgrade(profile = 'default') {
    try {
      // upgrade .cenv files.. and store them in .cenv folders for each project to clear up the clutter
      await this.UpgradeIncrement('1.0.0', this.Upgrade_1_0_0);

      // migrate the .cenv config file names from [profile] to [profile]-[env]
      await this.UpgradeIncrement('1.9.0', this.Upgrade_1_9_0);
    } catch (e) {
      CenvLog.single.catchLog(new Error(`FAILED: upgrading from ${this.installedVersion.toString()} to ${this.currentVersion.toString()}\n\n
      error: ${e}`))
    }
  }

  static incrementVersionFile(currentVersion: SemVer) {

    this.versionFileData.version = currentVersion.toString();
    this.versionFileData.upgradedTs = Date.now();

    if (!this.versionFileData.upgrades) {
      this.versionFileData.upgrades = [];
    }
    this.versionFileData.upgrades.push({ts: this.versionFileData.upgradedTs, v: this.versionFileData.version});
  }

  static async UpgradeIncrement(incrementVersion: string, upgradeIncrementFunc: () => Promise<void>) {
    this.nextIncrementVersion = sureParse(incrementVersion, this.opt);

    if (lt(this.installedVersion, this.nextIncrementVersion, this.opt)) {
      CenvLog.single.infoLog(`incremental upgrade from ${this.installedVersion.toString()} to ${this.nextIncrementVersion.toString()}`, 'GLOBAL');
      try {
        await upgradeIncrementFunc();
        this.installedVersion = this.nextIncrementVersion;
        this.incrementVersionFile(this.installedVersion);
      } catch (e) {
        CenvLog.single.catchLog(new Error(`FAILED: upgrading from ${this.installedVersion.toString()} to ${this.nextIncrementVersion.toString()}\n\n
        The error occurred during an incremental upgrade. The system is currently in an undefined state.\n\nPlease call your congressman and / or your priest.\n\n
        error: ${e}`))
      }
    }
  }

  static async Upgrade_1_0_0() {
    let monoRoot = getMonoRoot();
    if (!monoRoot) {
      monoRoot = getProbableMonoRoot();
      CenvLog.single.catchLog('could not upgrade from a version before 1.0.0 automatically.. try putting a suites.json or cenv.json file in the root directory');
      process.exit(391);
    }
    const search = search_sync(path.resolve(monoRoot), false, true, '.cenv', {
      excludedDirs: ['node_modules', 'cdk.out', '.cenv'], startsWith: true,
    }) as string[];

    const newDirs: any = {};
    for (let i = 0; i < search.length; i++) {
      const file = search[i];
      const fileParts = path.parse(file);
      const parentDir = fileParts.dir.split('/').pop();
      if (parentDir === 'tempCenvDir') {
        if (!newDirs[fileParts.dir]) {
          newDirs[fileParts.dir] = 0;
        }
        newDirs[fileParts.dir]++;
        continue;
      }
      const newDir = fileParts.dir + '/tempCenvDir';
      if (!existsSync(newDir)) {
        mkdirSync(newDir);
      }
      const newFile = newDir + '/' + fileParts.base;
      if (!newDirs[newDir]) {
        newDirs[newDir] = 0;
      }
      newDirs[newDir]++;
      renameSync(file, newFile);
    }
    for (let i = 0; i < Object.keys(newDirs).length; i++) {
      const dir = Object.keys(newDirs)[i];
      const root = path.parse(dir);
      const newPath = root.dir + '/.cenv';
      if (existsSync(newPath)) {
        const cenvSearch = search_sync(dir, false, true, '.cenv', {
          excludedDirs: ['node_modules', 'cdk.out', '.cenv'], startsWith: true,
        }) as string[];
        if (Array.isArray(cenvSearch)) {
          cenvSearch.forEach((f) => {
            const fileParts = path.parse(f);
            renameSync(f, newPath + '/' + fileParts.base);
          });
        }
        rmdirSync(dir);
      } else {
        renameSync(dir, newPath);
      }
    }
    const searchF = '.cenv.' + process.env.ENV;
    const cenvEnvSearch = search_sync(path.resolve(monoRoot), false, true, searchF, {
      excludedDirs: ['node_modules', 'cdk.out'], startsWith: true
    },) as string[];
    for (let i = 0; i < cenvEnvSearch.length; i++) {
      const file = cenvEnvSearch[i];
      const newFile = file.replace(process.env.ENV!, process.env.ENV + '-' + process.env.CDK_DEFAULT_ACCOUNT,);
      if (file.indexOf('.' + process.env.ENV + '-' + process.env.CDK_DEFAULT_ACCOUNT,) > -1) {
        CenvLog.single.infoLog(`the file ${file} has already been upgraded`);
        continue;
      }
      if (existsSync(newFile)) {
        if (process.env.KILL_IT_WITH_FIRE) {
          rmSync(file);
        } else {
          CenvLog.single.alertLog(`attempting to upgrade file ${infoAlertBold(file,)} but the file ${infoAlertBold(newFile)} already exists`,);
        }
        continue;
      }
      renameSync(file, newFile);
    }
  }

  static async Upgrade_1_9_0() {
    const profileFileData = await getProfiles(false);
    profileFileData.forEach((profileData: ProfileData) => {
      renameSync(profileData.profilePath, path.join(CenvFiles.ProfilePath, `${profileData.envConfig?.AWS_PROFILE}↔${profileData.envConfig?.ENV}`));
    });

  }

  private static textOutput(inputUpperCaseUnderLineSeperated: string) {
    return inputUpperCaseUnderLineSeperated.replace(/_/g, ' ').toLowerCase();
  }
}
