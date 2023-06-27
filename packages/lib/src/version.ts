import path, { join } from 'path';
import {CenvLog, infoAlertBold} from './log';
import { Package } from './package/package';
import semver, {SemVer} from "semver";
import {existsSync, mkdirSync, renameSync, rmdirSync, rmSync, writeFileSync} from "fs";
import {configure} from "./stdIo";
import {getMonoRoot, search_sync} from "./utils";

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
  version: semver.SemVer;
  previousVersion?: semver.SemVer;
  initialVersion: semver.SemVer;
  upgradedTs?: number;
  lastTs: number;
}

export enum BumpType {
  DISABLED = 'DISABLED',
  BUMP = 'BUMP',
  DECREMENT = 'DECREMENT',
  FINALIZE_PRERELEASE = 'FINALIZE_PRERELEASE'
}

export const bumpTypeID = 'CENV_BUMP_TYPE';
export const bumpModeID = 'CENV_BUMP_MODE';
export const bumpStateID = 'CENV_BUMP_STATE';

export class Version {
  static gitIgnoreFile: string = join(`./.gitignore`);
  private static modeKey = 0;
  private static typeKey = 0;

  static currentVersion: SemVer;

  static setBumpType(bumpType: BumpType) {
    process.env[bumpTypeID] = bumpType;
  }

  static setBumpMode(bumpMode: BumpMode) {
    process.env[bumpModeID] = bumpMode;
  }

  static get bumpType() {
    const keys = Object.keys(BumpType)
    const type = BumpType[keys[this.typeKey]];
    process.env[bumpTypeID] = type;
    return type;
  }

  static get bumpMode() {
    const keys = Object.keys(BumpMode)
    const mode = BumpMode[keys[this.modeKey]];
    process.env[bumpModeID] = mode;
    return mode;
  }

  static get bumpTypeText() {
    return this.textOutput(this.bumpType);
  }

  static get bumpModeText() {
    return this.textOutput(this.bumpMode);
  }

  private static textOutput(inputUpperCaseUnderLineSeperated: string) {
    return inputUpperCaseUnderLineSeperated.replace(/_/g, ' ').toLowerCase();
  }

  static get bumpState() {
    process.env[bumpStateID] = `${this.bumpType}_${this.bumpMode}`;
    return process.env[bumpStateID];
  }

  static get bumpStateText() {
    return this.textOutput(this.bumpState);
  }

  static get nextBumpType() {
    if (this.bumpMode === BumpMode.DISABLED)
      return BumpType.DISABLED;

    const typeKeys = Object.keys(BumpType);
    this.typeKey = this.typeKey + 1 === typeKeys.length ? 1 : this.typeKey + 1;
    let next = BumpType[typeKeys[this.typeKey]];
    if (next === BumpType.FINALIZE_PRERELEASE && this.bumpMode.indexOf('PRERELEASE') === -1) {
      this.typeKey = 0;
      next = BumpType[typeKeys[this.typeKey]];
    }
    return this.textOutput(next);
  }

  static get nextBumpMode() {
    const modeKeys = Object.keys(BumpMode);
    this.modeKey = this.modeKey + 1 === modeKeys.length ? 0 : this.modeKey + 1;
    let next = BumpMode[modeKeys[this.modeKey]];
    if (next.indexOf('PRERELEASE') === -1 && this.bumpType === BumpType.FINALIZE_PRERELEASE) {
      this.modeKey = 0;
      next = BumpMode[modeKeys[this.modeKey]];
    }
    if(this.bumpType === BumpType.DISABLED) {
      this.setBumpType(BumpType.BUMP);
    }
    return this.textOutput(next);
  }

  static async Bump(packages, type) {
    try {
      CenvLog.single.infoLog(`bump ${packages.length} potential packages: ${type}`)
      await Promise.all(packages.filter(p => !p.isGlobal).map(async (p: Package) => await p.bump(type)));
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }

  static async getVersion() {
    const currentVersion = require(path.resolve(__dirname, '../package.json',)).version;
    this.currentVersion = semver.parse(currentVersion);
    const versionFile = path.resolve(__dirname, '../.version.json');
    let versionFileData: IVersionFile = {
      version: semver.parse('0.1.0'),
      initialVersion: semver.parse('0.1.0'),
      lastTs: Date.now(),
    };
    if (existsSync(versionFile)) {
      versionFileData = require(versionFile);
    }

    if (
      !versionFileData.upgradedTs ||
      semver.gt(this.currentVersion, versionFileData.version)
    ) {
      await this.Upgrade(currentVersion, versionFileData.version);
      versionFileData.version = currentVersion.toString();
      versionFileData.upgradedTs = Date.now();
    }
    process.env.CENV_VERSION = currentVersion;
    writeFileSync(versionFile, JSON.stringify(versionFileData, null, 2));
    return versionFileData;
  }

  static async Upgrade(currentVersion: semver.SemVer, previousVersion: semver.SemVer, profile = 'default') {
    await configure({ profile });
    CenvLog.info(
      `upgrading from ${previousVersion.toString()} to ${currentVersion.toString()}`,
    );
    if (semver.lt(previousVersion.toString(), '1.0.0')) {
      const monoRoot = getMonoRoot();
      const search = search_sync(path.resolve(monoRoot), false, true, '.cenv', {
        excludedDirs: ['node_modules', 'cdk.out', '.cenv'],
        startsWith: true,
      });
      const newDirs = {};
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
            excludedDirs: ['node_modules', 'cdk.out', '.cenv'],
            startsWith: true,
          });
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
      const cenvEnvSearch = search_sync(
        path.resolve(monoRoot),
        false,
        true,
        searchF,
        { excludedDirs: ['node_modules', 'cdk.out'], startsWith: true },
      );
      for (let i = 0; i < cenvEnvSearch.length; i++) {
        const file = cenvEnvSearch[i];
        const newFile = file.replace(
          process.env.ENV,
          process.env.ENV + '-' + process.env.CDK_DEFAULT_ACCOUNT,
        );
        if (
          file.indexOf(
            '.' + process.env.ENV + '-' + process.env.CDK_DEFAULT_ACCOUNT,
          ) > -1
        ) {
          CenvLog.single.alertLog(`the file ${file} has already been upgraded`);
          continue;
        }
        if (existsSync(newFile)) {
          if (process.env.KILL_IT_WITH_FIRE) {
            rmSync(file);
          } else {
            CenvLog.single.alertLog(
              `attempting to upgrade file ${infoAlertBold(
                file,
              )} but the file ${infoAlertBold(newFile)} already exists`,
            );
          }
          continue;
        }
        renameSync(file, newFile);
      }
    }
  }
}
