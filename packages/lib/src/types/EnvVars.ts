import { writeFileSync } from 'fs';
import { CenvLog } from '../log'
import { pick } from './Object'

export function validateEnvVars(envVars: string[]): Record<string, string> | never {
  let valid = true;
  const validatedEnvVars: Record<string, string> = {};
  for (const keyIndex in envVars) {
    const key = envVars[keyIndex];
    const value = process.env[key];
    if (value === undefined) {
      const msg = `the required environment variable "${key}" was not provided to the stack`;
      if (CenvLog?.single) {
        CenvLog.single.errorLog(msg)
      } else {
        console.error('error', msg)
      }
      valid = false;
    } else {
      validatedEnvVars[key] = value;
    }
  }
  if (!valid) {
    process.exit(-33);
  }
  return validatedEnvVars;
}

export class EnvVars {
  private _vars: Record<string, string> = {};
  private _hidden: string[];

  constructor(propertyBag: Record<string, string> = {}, envVarKeys: string[] = [], hiddenKeys: string[] = [], envVarsOnly = false) {
    // set hidden keys
    this._hidden = hiddenKeys;

    // remove empty entries from the property bag
    propertyBag = Object.fromEntries(Object.entries(propertyBag).filter(([_, v]) => v != null));

    // set the initial properties to match only the passed in env var keys if envVarsOnly flag is true otherwise set it to the entire propertyBag
    this._vars = envVarsOnly ? pick({...propertyBag}, ...envVarKeys) : propertyBag;

    // set properties for the keys provided in environmentVariables from the active process.env values
    this.setEnvVars(envVarKeys);
  }

  write(path: string, keys?: string[]) {
    const objectToWrite: Record<string, string> = keys ?  pick(this.allSafe, ...keys) : this.allSafe;
    writeFileSync(path, JSON.stringify(objectToWrite, null, 2));
  }

  get allSafe() {
    const tempVars = this._vars;
    for (const key in this._hidden) {
      if (tempVars[this._hidden[key]]) {
        delete tempVars[this._hidden[key]];
      }
    }
    return tempVars;
  }

  get all() {
    return this._vars;
  }

  get json() {
    return JSON.stringify(this._vars, null, 2);
  }

  static clean(value: string) {
    if (value.indexOf(' ') === -1) {
      return value.split('"').join('');
    }
    return value;
  }

  get(key: string): string {
    const value = this._vars[key];
    if (!value) {
      CenvLog.single.errorLog(`the key ${key} was not found in the environment variable key store`);
      process.exit(545);
    }

    return EnvVars.clean(value);
  }

  check(key: string): string | undefined {
    const value = this._vars[key];
    if (!value) {
      return undefined;
    }

    return EnvVars.clean(value);
  }

  set(key: string, value: string) {
    if (!value) {
      return;
    }
    key = EnvVars.clean(key);
    value = EnvVars.clean(value);
    if (!value) {
      return;
    }
    this._vars[key] = value;
    process.env[key] = value;
  }

  add(envVars: {[key: string]: string}) {
    for (const [key, value] of Object.entries(envVars)) {
      this.set(key, value);
    }
  }

  remove(key: string) {
    delete this._vars[key];
    delete process.env[key];
  }

  setVars(envVars: {[key: string]: string}) {
    for (const key in Object.keys(this._vars)) {
      if (!envVars[key]) {
        this.remove(key)
      }
    }
    this.add(envVars);
  }

  setEnvVars(envVars: string []) {
    for (const key in envVars) {
      if (process.env[key]) {
        this.set(key, process.env[key]!);
      }
    }
  }
}