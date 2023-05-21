import { join } from 'path';
import { CenvLog } from './log';
import { Package } from './package/package';

export enum BumpMode {
  DISABLED = 'DISABLED',
  ALPHA_PRERELEASE = 'ALPHA_PRERELEASE',
  BETA_PRERELEASE = 'BETA_PRERELEASE',
  RC_PRERELEASE = 'RC_PRERELEASE',
  PATCH = 'PATCH',
  MINOR = 'MINOR',
  MAJOR = 'MAJOR'
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
      ;
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
}
