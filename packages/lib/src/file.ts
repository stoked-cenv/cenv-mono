import {configDefaults,} from "./configDefaults";
import {join, relative} from "path";
import * as yaml from 'js-yaml';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'fs';
import {CenvLog} from './log';
import Ajv from "ajv";
import { prettyPrint} from "@base2/pretty-print-object";
import {CenvParams} from "./params";
import {envVarToKey, pathToEnvVarKey} from './aws/parameterStore';
import {encrypt} from './aws/kms';
import * as path from 'path';
import { Cenv } from './cenv';
import { Package } from './package/package';


const {appExt} = configDefaults;

const ajv = new Ajv({allErrors: true, verbose: true});

export const cenvRoot = './.cenv/';

class Settings {
  ApplicationName = '';
  EnvironmentName = '';
}

export interface IEnvConfig {
  ApplicationName: string;
  EnvironmentName: string;
  ApplicationId?: string;
  EnvironmentId?: string;
  ConfigurationProfileId?: string;
  MetaConfigurationProfileId?: string;
  DeploymentNumber?: number;
}
export class EnvConfig {
  ApplicationName: string;
  EnvironmentName: string;
  ApplicationId?: string;
  EnvironmentId?: string;
  ConfigurationProfileId?: string;
  MetaConfigurationProfileId?: string;
  DeploymentNumber?: number;

  constructor(config: IEnvConfig) {
    this.ApplicationName = config.ApplicationName;
    this.EnvironmentName = config.EnvironmentName;
    this.ApplicationId = config.ApplicationId;
    this.EnvironmentId = config.EnvironmentId;
    this.ConfigurationProfileId = config.ConfigurationProfileId;
    this.MetaConfigurationProfileId = config.MetaConfigurationProfileId;
    this.DeploymentNumber = config.DeploymentNumber;
  }

  get valid(): boolean {
    return this.ApplicationId !== undefined && this.EnvironmentId !== undefined && this.ConfigurationProfileId !== undefined && this.MetaConfigurationProfileId !== undefined;
  }
}

type DecryptedValue = `${'--DEC='}${string}`;
type EncryptedValue = `${'--ENC='}${string}`;
type ReservedNames = "globalEnv" | "global"
type ValidVarKey = Exclude<string, ReservedNames>;
type StringValue = Exclude<string, EncryptedValue | DecryptedValue>;
type CenvValue = StringValue | EncryptedValue | DecryptedValue;
export type VarList = { [key: ValidVarKey]: CenvValue }
export type AppVars = VarList | VarList & { global?: [string], globalEnv?: [string] };
export class CenvVars {
  app: AppVars = {};
  environment: VarList = {};
  global: VarList = {};
  globalEnv: VarList = {};
}


export interface IParameter {
  Value: string;
  ParamType: string;
  Type: string
  Name: string;
}

export class File {
  public static notReserved: object = {anyOf: [{required: ['newGlobal']}, {required: ['global']}]};

  public static get PATH(): string {
    return join(CenvFiles.PATH, this.NAME);
  }

  public static get NAME(): string {
    return `.invalid.file`;
  }

  public static get DESCRIPTION(): string {
    return 'invalid description'
  }

  public static get SCHEMA(): any {
    return {};
  }

  public static read(name: string, schema: any, silent = false): any {

    let path = name;
    if (name.startsWith('/')) {
      path = name;
    }
    if (!existsSync(path)) {
      if (!silent) {
        CenvLog.single.alertLog(`could not read ${process.cwd()}/${CenvLog.colors.alertBold(name)} the file doesn't exist`)
      }
      return undefined;
    }

    const data = yaml.load(readFileSync(path, 'utf8'));
    if (data) {
      const validate = ajv.compile(this.SCHEMA)

      if (validate(data)) {
        return data;
      } else {
        File.printErrors(validate.errors, this.NAME, this.DESCRIPTION, data, CenvFiles.PATH);
        return data;
      }
    }

    return undefined;
  }

  static sortObjectKeys(data: Record<string, any>) {
    const sortedKeys = Object.keys(data).filter(k => k !== 'global' && k !== 'globalEnv').sort();
    const sortedObject: any = {};
    sortedKeys.forEach(k => sortedObject[k] = data[k]);
    return sortedObject;
  }

  public static save(data: any, silent = false, name: string = this.NAME, path: string = CenvFiles.PATH) {
    if (!silent) {
      CenvLog.info(` - saving ${CenvLog.colors.infoBold(name)}`);
    }
    if (!existsSync(path)) {
      mkdirSync(path);
    }

    const sortedObject: any = this.sortObjectKeys(data);
    if (data?.global) {
      sortedObject.global = data.global.sort();
    }

    if (data?.globalEnv) {
      sortedObject.globalEnv = data.globalEnv.sort();
    }
    writeFileSync(join(path, name), yaml.dump(sortedObject));
  }

  public static delete(silent = false, name: string) {
    unlinkSync(join(cenvRoot, name));
  }

  protected static printErrors(errors: any, name: string, description: string, data: any, path: string) {
    const typeTitle = description.toLowerCase().split(' ').map((word) => {
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
    const errorTitle = CenvLog.colors.error(`${CenvLog.colors.errorBold(typeTitle)}: [${CenvLog.colors.errorBold(name)}] Parse Failed`);
    const logLine = '-'.repeat(80);
    const pathLine = CenvLog.colors.error(`Path: ${join(path, name)}`);
    let log = `${pathLine}\n${logLine}\n${errorTitle}\n${logLine}\n\n`;
    for (let i = 0; i < errors.length; i++) {
      const error: any = errors[i];
      let pretty = prettyPrint(error, {
        transform: (obj, prop, originalResult) => {
          return prop === Object(prop) ? JSON.stringify(prop) : originalResult;
        }, singleQuotes: false
      });
      pretty = pretty.split('\n').join('\n\t\t');
      log += `\t\t${CenvLog.colors.errorBold(error.message)}\n`;
      log += `\t\t${'-'.repeat(50)}\n`;
      log += '\t\t' + CenvLog.colors.error(pretty);
      log += `\n\n`;

      log += logLine + '\n\n';
    }
    console.log(CenvLog.colors.errorDim(log));
  }
}

export class SettingsFile extends File {
  public static get NAME(): string {
    return `${appExt}.settings`;
  }

  public static get DESCRIPTION(): string {
    return 'local settings'
  }

  public static get SCHEMA(): any {
    return {
      type: 'object', properties: {
        ApplicationName: {type: 'string'}, EnvironmentName: {type: 'string'},
      }, required: ['ApplicationName', 'EnvironmentName'], additionalProperties: false,
    }
  }
}

export interface searchSyncFallbackResults {
  results: string[],
  fallbacks: string[]
}


export class EnvConfigFile extends File {
  public static get NAME(): string {
    const name = `${appExt}.[--env--]-[--accountId--].config`;
    if (CenvFiles.ENVIRONMENT) {
      return name.replace('[--env--]', CenvFiles.ENVIRONMENT).replace('[--accountId--]', CenvFiles.AWS_ACCOUNT_ID);
    }
    return name;
  }

  public static get DESCRIPTION(): string {
    return 'environment config'
  }

  public static get SCHEMA(): any {
    return {
      type: 'object', properties: {
        ApplicationName: {type: 'string'}, EnvironmentName: {type: 'string'},
      }, required: ['ApplicationName', 'EnvironmentName'], additionalProperties: false,
    }
  }
}

export class AppVarsFile extends File {
  public static get NAME(): string {
    return `${appExt}`;
  }

  public static get DESCRIPTION(): string {
    return 'variables file'
  }

  public static get SCHEMA(): any {
    return {
      type: 'object', additionalProperties: {
        type: 'string'
      }, properties: {
        newGlobal: {
          type: 'object', additionalProperties: {
            type: 'string',
          }, not: File.notReserved,
        }, global: {
          type: 'array', items: {
            type: 'string', // TODO: this is broken!!!
            //not: this.notReserved,
          },
        }, globalEnv: {
          type: 'array', items: {
            type: 'string', // TODO: this is broken!!!
            //not: this.notReserved,
          },
        },
      }, title: 'config'
    }
  }
}

export class EnvVarsFile extends File {
  public static get NAME(): string {
    const name = `${appExt}.[--env--]-[--accountId--]`;
    if (CenvFiles.ENVIRONMENT) {
      if (CenvFiles.ENVIRONMENT === 'local') {
        return name.replace('[--env--]', CenvFiles.ENVIRONMENT).replace('-[--accountId--]', '');
      }
      return name.replace('[--env--]', CenvFiles.ENVIRONMENT).replace('[--accountId--]', CenvFiles.AWS_ACCOUNT_ID);
    }
    return name;
  }

  public static get DESCRIPTION(): string {
    return 'environment variables file'
  }

  public static get SCHEMA(): any {
    return {
      type: "object", not: File.notReserved, additionalProperties: {
        type: "string"
      },
    }
  }

  public static get TEMPLATE_PATH(): string {
    return join(CenvFiles.PATH, this.TEMPLATE);
  }

  public static get TEMPLATE(): string {
    return `${appExt}.env.template`;
  }
}

export class GlobalVarsFile extends File {
  public static get PATH(): string {
    const p = join(CenvFiles.GLOBAL_PATH as string, this.NAME as string);
    return p.toString();
  }

  public static get NAME(): string {
    return `${appExt}.globals`;
  }

  public static get DESCRIPTION(): string {
    return 'global variables file'
  }

  public static get SCHEMA(): any {
    return {
      type: "object", not: File.notReserved, additionalProperties: {
        type: "string"
      },
    }
  }

  public static save(data: any, silent = false, name: string = this.NAME, path: string = CenvFiles.GLOBAL_PATH) {
    let merged = data;
    if (existsSync(this.PATH)) {
      const globalData = super.read(this.PATH, this.SCHEMA, false);
      merged = {...globalData, ...data};
    }
    if (!silent) {
      CenvLog.info(` - saving ${CenvLog.colors.infoBold(name)}`);
    }
    const sortedObject: any = this.sortObjectKeys(merged);
    writeFileSync(join(path, name), yaml.dump(sortedObject));
  }
}

export class GlobalEnvVarsFile extends File {
  public static get PATH(): string {
    const p = join(CenvFiles.GLOBAL_PATH as string, this.NAME as string);
    return p.toString();
  }

  public static get NAME(): string {
    const name = `${appExt}.[--env--]-[--accountId--].globals`;
    return name.replace('[--env--]', CenvFiles.ENVIRONMENT).replace('[--accountId--]', CenvFiles.AWS_ACCOUNT_ID);
  }

  public static get DESCRIPTION(): string {
    return 'environment specific global variables file'
  }

  public static get SCHEMA(): any {
    return {
      type: "object", not: File.notReserved, additionalProperties: {
        type: "string"
      },
    }
  }

  public static get TEMPLATE_PATH(): string {
    return join(CenvFiles.GLOBAL_PATH, this.TEMPLATE);
  }

  public static get TEMPLATE(): string {
    return `${appExt}.env.globals.template`
  }

  public static save(data: any, silent = false, name: string = this.NAME, path: string = CenvFiles.GLOBAL_PATH) {
    let merged = data;
    if (existsSync(this.PATH)) {
      const globalData = super.read(this.PATH, this.SCHEMA, false);
      merged = {...globalData, ...data};
    }

    if (!silent) {
      CenvLog.info(` - saving ${CenvLog.colors.infoBold(name)}`);
    }
    const sortedObject: any = this.sortObjectKeys(merged);
    writeFileSync(join(path, name), yaml.dump(sortedObject));
  }
}


export function search_sync(dir: string, first = false, searchDown = true, searchFile: string | RegExp = 'package.json', options: {
  startsWith?: boolean;
  endsWith?: boolean;
  excludedDirs?: string[];
  includedDirs?: string[];
  regex?: boolean;
  fallBack?: string;
  depth?: number
} = {
  startsWith: false, endsWith: false, excludedDirs: [], includedDirs: [], regex: false, depth: -1
}): searchSyncFallbackResults | string[] {
  return search_sync_depth(dir, first, searchDown, searchFile, options, 1);
}


function parsedRet(retVal: searchSyncFallbackResults, res: searchSyncFallbackResults | string[], fallback = false) {
  if (fallback) {
    const resFallback = res as searchSyncFallbackResults;
    if (resFallback.results.length) {
      retVal.results = retVal.results.concat(resFallback.results);
    }
    if (resFallback.fallbacks.length) {
      retVal.fallbacks = retVal.fallbacks.concat(resFallback.fallbacks);
    }
  } else {
    retVal.results = retVal.results.concat(res as string[]);
  }
}

function search_sync_depth(dir: string, first = false, searchDown = true, searchFile: string | RegExp = 'package.json', options: {
  startsWith?: boolean;
  endsWith?: boolean;
  excludedDirs?: string[];
  includedDirs?: string[];
  regex?: boolean;
  fallBack?: string;
  depth?: number
} = {
  startsWith: false, endsWith: false, excludedDirs: [], includedDirs: [], regex: false, depth: -1
}, currentDepth = 0): searchSyncFallbackResults | string[] {
  if (!options?.depth) {
    options.depth = -1;
  }
  const retVal: searchSyncFallbackResults = {results: [], fallbacks: []};
  const list = readdirSync(dir);
  const directories: string[] = [];
  for (let i = 0; i < list.length; i++) {
    const fileName: string = list[i].toString();
    const file = path.resolve(dir, fileName.toString());
    const filenameList = file.split('\\');
    const filename = filenameList[filenameList.length - 1];
    const stat = statSync(file);
    if (stat && stat.isDirectory() && searchDown) {
      let addDir = true;
      if (options?.excludedDirs?.length) {
        const excludedMatches = options?.excludedDirs.filter((ed) => file.endsWith('/' + ed),);
        addDir = !excludedMatches.length;
      }
      const folder = file.split('/').pop();
      if (first && folder === searchFile) {
        return [file];
      } else if (addDir) {
        directories.push(file);
      }

    } else {
      if (options?.includedDirs?.length) {
        const includedMatches = options?.includedDirs?.filter((id) => dir.endsWith('/' + id),);
        if (!includedMatches.length) {
          continue;
        }
      }

      if (options.fallBack && fileName === options.fallBack) {
        retVal.fallbacks.push(file);
      }

      let foundFile: string | undefined = undefined;
      if (searchFile instanceof RegExp) {
        const m = fileName.match(searchFile)?.length;
        if (m) {
          foundFile = file;
        }
      } else if (!options?.regex && fileName === searchFile) {
        foundFile = file;
      } else if (options?.startsWith && fileName.startsWith(searchFile)) {
        foundFile = file;
      } else if (options?.endsWith && fileName.endsWith(searchFile)) {
        foundFile = file;
      } else if (options?.regex) {
        const m = fileName.match(searchFile)?.length;
        if (m) {
          foundFile = file;
        }
      }
      if (foundFile) {
        if (first) {
          if (options.fallBack) {
            return {results: [filename], fallbacks: []};
          } else {
            return [filename];
          }

        }
        retVal.results.push(foundFile);
      }
    }
  }

  if (options.depth > 0 && currentDepth >= options.depth) {
    if (options.fallBack) {
      return retVal as searchSyncFallbackResults;
    } else {
      return retVal.results as string[];
    }
  }

  if (searchDown) {
    for (let i = 0; i < directories.length; i++) {
      const dirPath = directories[i];
      const res = search_sync_depth(dirPath, first, searchDown, searchFile, options, currentDepth + 1);
      parsedRet(retVal, res, options?.fallBack !== undefined);
    }
  } else {
    const numSlashes = path.resolve(dir).split('/').length - 1;
    if (numSlashes > 1) {
      const res = search_sync_depth(join(dir, '../'), first, searchDown, searchFile, options, currentDepth + 1);
      parsedRet(retVal, res, options?.fallBack !== undefined);
    }
  }

  if (options.fallBack) {
    return retVal as searchSyncFallbackResults;
  } else {
    return retVal.results as string[];
  }
}

interface LocalCenvFiles {
  vars: boolean,
  envVarTemplate: boolean,
  globalVars: boolean,
  globalEnvVarTemplate: boolean,
  config: string[],
  envVars: string[],
  globalEnvVars: string[]
}

export class CenvFiles {
  //static envVars = validateEnvVars(['APPLICATION_NAME', 'ENVIRONMENT_NAME', 'HOME', 'ENV', 'CDK_DEFAULT_ACCOUNT', 'AWS_ACCOUNT_ID'])

  public static readonly ENVIRONMENT_TEMPLATE_TOKEN = '[--env--]';
  public static Settings: Settings;
  public static EnvConfig: IEnvConfig;
  public static AppVars: AppVars = {};
  public static EnvVars: VarList = {};
  public static GlobalVars: VarList = {};
  public static GlobalEnvVars: VarList = {};
  private static GlobalPath: string | null = null;
  private static ProfilePath: string | null = null;
  private static GitTempPath: string | null = null;
  private static LogPath: string | null = null;
  private static ArtifactsPath: string | null = null;
  private static DumpPath: string | null = null;
  private static path = cenvRoot;
  private static environment: string = process.env.ENV!;

  public static get GIT_TEMP_PATH(): string {
    if (!this.GitTempPath) {
      CenvLog.single.catchLog('CenvFiles.GitTempPath is trying to be accessed but has not been set');
      process.exit(799);
    }
    return this.GitTempPath;
  }

  public static get GLOBAL_PATH(): string {
    if (!this.GlobalPath) {
      CenvLog.single.catchLog('CenvFiles.GlobalPath is trying to be accessed but has not been set');
      process.exit(799);
    }
    return this.GlobalPath;
  }

  public static get LOG_PATH(): string {
    if (!this.LogPath) {
      this.LogPath = path.join(process.env.HOME!, cenvRoot, 'logs');
    }
    return this.LogPath;
  }

  public static get PROFILE_PATH(): string {
    if (!this.ProfilePath) {
      CenvLog.single.catchLog('CenvFiles.ProfilePath is trying to be accessed but has not been set');
      process.exit(799);
    }
    return this.ProfilePath;
  }

  public static get ARTIFACTS_PATH(): string {
    if (!this.ArtifactsPath) {
      CenvLog.single.catchLog('CenvFiles.ArtifactsPath is trying to be accessed but has not been set');
      process.exit(799);
    }
    return this.ArtifactsPath;
  }

  public static get DUMP_PATH(): string {
    if (!this.DumpPath) {
      CenvLog.single.catchLog('CenvFiles.DumpPath is trying to be accessed but has not been set');
      process.exit(799);
    }
    return this.DumpPath;
  }

  public static get SESSION_PARAMS(): {
    ApplicationIdentifier: string, EnvironmentIdentifier: string, ConfigurationProfileIdentifier: string
  } {
    if (this.EnvConfig.ApplicationId === undefined || this.EnvConfig.EnvironmentId === undefined || this.EnvConfig.ConfigurationProfileId === undefined) {
      CenvLog.single.catchLog(['SESSION_PARAMS error', 'No config found']);
      process.exit(22);
    }
    return {
      ApplicationIdentifier: this.EnvConfig.ApplicationId,
      EnvironmentIdentifier: this.EnvConfig.EnvironmentId,
      ConfigurationProfileIdentifier: this.EnvConfig.ConfigurationProfileId,
    }
  }

  public static get SESSION_PARAMS_META(): {
    ApplicationIdentifier: string, EnvironmentIdentifier: string, ConfigurationProfileIdentifier: string
  } {
    if (this.EnvConfig.ApplicationId === undefined || this.EnvConfig.EnvironmentId === undefined || this.EnvConfig.MetaConfigurationProfileId === undefined) {
      CenvLog.single.catchLog(['SESSION_PARAMS_META error', 'No meta config found']);
      process.exit(11);
    }
    return {
      ApplicationIdentifier: this.EnvConfig.ApplicationId,
      EnvironmentIdentifier: this.EnvConfig.EnvironmentId,
      ConfigurationProfileIdentifier: this.EnvConfig.MetaConfigurationProfileId,
    }
  }

  public static get PATH(): any {
    return this.path;
  }

  public static set PATH(path: string) {
    this.path = path;
  }

  public static get ENVIRONMENT(): any {
    if (!this.environment) {
      this.environment = process.env.ENV! || process.env.EnvironmentName!;
    }
    return this.environment;
  }

  public static set ENVIRONMENT(environment: string) {
    this.environment = environment;
  }

  public static get AWS_ACCOUNT_ID(): any {
    return process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID || 'local'
  }

  public static get PRIMARY_PACKAGE_PATH(): any {
    if (!Cenv.primaryPackagePath) {
      Cenv.primaryPackagePath = 'packages';
    }
    const root = this.getMonoRoot();
    if (!root) {
      CenvLog.single.catchLog('can not find the primary package path because there is no mono repo');
      process.exit(799);
    }
    return join(root, Cenv.primaryPackagePath);

  }

  // load the environment config
  public static LoadEnvConfig(environment: string = CenvFiles.ENVIRONMENT) {
    this.ENVIRONMENT = environment;
    this.EnvConfig = File.read(EnvConfigFile.PATH, EnvConfigFile.SCHEMA, true) as EnvConfig;
    return this.EnvConfig;
  }

  public static async GetLocalVars(applicationName: string, typed = false, decrypted = true, globalLinks = false) {
    await this.LoadVars(applicationName, decrypted, globalLinks);
    const ret: any = {
      app: this.AppVars, environment: this.EnvVars, globalEnv: this.GlobalEnvVars, global: this.GlobalVars
    };
    if (typed) {
      return ret;
    }
    return {...ret.app, ...ret.environment, ...ret.globalEnv, ...ret.global };
  }

  public static async GetData(applicationName: string, decrypted = false) {
    this.LoadEnvConfig();
    await this.LoadVars(applicationName, decrypted);
    return {
      EnvConfig: this.EnvConfig, Vars: {
        app: this.AppVars, environment: this.EnvVars, globalEnv: this.GlobalEnvVars, global: this.GlobalVars
      }
    }
  }

  public static async KeyExists(key: string, path: string, type: string) {
    const envVar = pathToEnvVarKey(`${path}/${key}`, path);
    if (type !== 'app') {
      if (Object.keys(this.AppVars).includes(envVar)) {
        return 'app';
      }
    }
    if (type !== 'environment') {
      if (Object.keys(this.EnvVars).includes(envVar)) {
        return 'environment';
      }
    }
    if (type !== 'global') {
      if (Object.keys(this.GlobalVars).includes(envVar)) {
        return 'global';
      }
    }
    if (type !== 'globalEnv') {
      if (Object.keys(this.GlobalEnvVars).includes(envVar)) {
        return 'globalEnv';
      }
    }
    return null;
  }

  public static SaveEnvConfig(config: IEnvConfig) {
    config.EnvironmentName = config.EnvironmentName || CenvFiles.ENVIRONMENT;
    this.EnvConfig = config;
    this.Settings = {
      ApplicationName: config.ApplicationName, EnvironmentName: config.EnvironmentName,
    };
    CenvFiles.ENVIRONMENT = config.EnvironmentName;
    //SettingsFile.save(this.Settings);
    EnvConfigFile.save(this.EnvConfig);
  }

  public static SaveVars(vars: any, environment: string, silent = false, path = './') {
    this.environment = environment;
    let finalVars: any = {};
    if (Object.keys(vars?.app ?? {}).length > 0) {
      finalVars = vars.app;
    }
    if (Object.keys(vars?.global ?? {}).length > 0) {
      finalVars.global = Object.keys(vars.global);
    }

    if (Object.keys(vars?.globalEnv ?? {}).length > 0) {
      finalVars.globalEnv = Object.keys(vars.globalEnv);
    }
    if (Object.keys(finalVars).length > 0) {
      AppVarsFile.save(finalVars, silent)
    }
    if (Object.keys(vars.environment).length > 0) {
      EnvVarsFile.save(vars.environment, silent);
    }
    if (Object.keys(vars.global).length > 0) {
      GlobalVarsFile.save(vars.global, silent, GlobalVarsFile.NAME, CenvFiles.GLOBAL_PATH);
    }
    if (Object.keys(vars.globalEnv).length > 0) {
      GlobalEnvVarsFile.save(vars.globalEnv, silent, GlobalEnvVarsFile.NAME, CenvFiles.GLOBAL_PATH);
    }
  }

  public static clean(startPath: string = cenvRoot, options?: Record<string, any>) {
    const cenvFiles = this.getLocalCenvFiles(undefined, options?.environment);
    const {vars, config, envVars, globalVars, envVarTemplate, globalEnvVars, globalEnvVarTemplate} = cenvFiles;

    if (vars && !config && !envVars && (!options?.globals || (options?.globals && !globalVars))) {
      CenvLog.single.errorLog(`project is already clean`);
      return;
    }

    if (envVarTemplate) {
      this.deleteLocalFile(EnvVarsFile.TEMPLATE_PATH);
    }

    if (envVars) {
      this.deleteFiles(envVars);
    }

    if (config) {
      this.deleteFiles(config.map(file => (file)));
    }

    if (vars) {
      this.deleteLocalFile(AppVarsFile.PATH);
    }

    if (options?.globals && !globalVars) {
      this.deleteLocalFile(GlobalVarsFile.PATH);
    }

    if (options?.globals && globalEnvVars) {
      this.deleteFiles(globalEnvVars.map(file => (file)));

      if (globalEnvVarTemplate) {
        this.deleteLocalFile(GlobalEnvVarsFile.TEMPLATE_PATH);
      }
    }
  }


  public static async decodeParameter(paramName: string, paramValue: string, paramType: string, rootPath: string): Promise<{
    [x: string]: IParameter
  }> {
    const param: IParameter = {Value: paramValue, Type: 'String', ParamType: paramType, Name: paramName};
    return {[`${rootPath}/${paramName}`]: param};
  }

  public static async encodeParameter(paramName: string, paramValue: string, paramType: string, rootPath: string): Promise<{
    [x: string]: IParameter
  }> {
    if (paramValue.startsWith('--DEC=')) {
      paramValue = paramValue.replace('--DEC=', '');
      paramValue = await encrypt(paramValue);
      paramValue = `--ENC=${paramValue}`;
    }
    const param: IParameter = {Value: paramValue, Type: 'String', ParamType: paramType, Name: paramName};
    return {[`${rootPath}/${paramName}`]: param};
  }

  private static Load(): void {
    this.LoadEnvConfig();
    this.LoadVars(this.EnvConfig.ApplicationName);
  }

  private static setEnvironment(environment: string) {
    if (!environment) {
      CenvLog.single.errorLog('no environment specified');
      process.exit(3);
    }
    this.ENVIRONMENT = environment;
  }

  private static LoadEnvironment(environment: string): void {
    this.setEnvironment(environment);
    this.Load();
  }

  private static async LoadVars(applicationName: string, decrypted = true, globalLinks = false) {
    const appData = File.read(AppVarsFile.PATH, AppVarsFile.SCHEMA, true) as AppVars;
    this.EnvVars = File.read(EnvVarsFile.PATH, EnvVarsFile.SCHEMA, true) as VarList;
    if (!this.EnvVars) {
      this.EnvVars = File.read(EnvVarsFile.TEMPLATE_PATH, EnvVarsFile.SCHEMA, true) as VarList;
    }
    const allGlobals = File.read(GlobalVarsFile.PATH, GlobalVarsFile.SCHEMA, true) as VarList;
    let allGlobalEnvVars = File.read(GlobalEnvVarsFile.PATH, GlobalEnvVarsFile.SCHEMA, true) as VarList;
    if (!allGlobalEnvVars) {
      allGlobalEnvVars = File.read(GlobalEnvVarsFile.TEMPLATE_PATH, GlobalEnvVarsFile.SCHEMA, true) as VarList;
    }
    const globals: any = {};

    if (appData?.global) {
      for (let i = 0; i < appData.global?.length; i++) {
        const globalVar = appData.global[i];
        if (allGlobals && allGlobals[globalVar]) {
          globals[globalVar] = allGlobals[globalVar];
        }
      }
      if (!globalLinks) {
        delete appData.global;
      }
    }

    const globalEnvs: any = {};
    if (appData?.globalEnv) {
      for (let i = 0; i < appData.globalEnv?.length; i++) {
        const globalEnvVar = appData.globalEnv[i];
        if (allGlobalEnvVars && allGlobalEnvVars[globalEnvVar]) {
          globalEnvs[globalEnvVar] = allGlobalEnvVars[globalEnvVar];
        }
      }
      if (!globalLinks) {
        delete appData.globalEnv;
      }
    }

    let overwriteData = {};
    if (process.env.ENV === 'local') {
      overwriteData = this.EnvVars;
    }
    /*
    const pickMatchingProps = (template: object, dataToMatch: object) => {
      const templateCp = JSON.parse(JSON.stringify(template));
      for (let key in templateCp) if (!dataToMatch[key]) delete templateCp[key]
      return templateCp;
    }

    this.GlobalVars = {...globals, ...pickMatchingProps(overwriteData, globals)};
    this.GlobalEnvVars = {...globalEnvs, ...pickMatchingProps(overwriteData, globalEnvs)};
    this.AppVars = {...appData as VarList, ...pickMatchingProps(overwriteData, appData)};
    this.AppVars.global = appData.global;
    this.AppVars.globalEnv = appData.globalEnv;

     */
    this.GlobalVars = globals;
    this.GlobalEnvVars = globalEnvs;
    this.AppVars = appData;

    if (decrypted) {
      const roots = CenvParams.GetRootPaths(applicationName, CenvFiles.ENVIRONMENT);
      this.GlobalVars = await this.DecryptVarsBase(roots.global, this.GlobalVars);
      this.GlobalEnvVars = await this.DecryptVarsBase(roots.globalEnv, this.GlobalEnvVars);
      this.EnvVars = await this.DecryptVarsBase(roots.environment, this.EnvVars);
      this.AppVars = await this.DecryptVarsBase(roots.app, this.AppVars);
    }
  }

  private static async DecryptVarsBase(rootPath: string, vars: any) {
    if (!vars) {
      return {};
    }
    const newVars: VarList = {};
    for (const [key, value] of Object.entries<string>(vars)) {
      const newKey = envVarToKey(key);

      newVars[key] = value;
    }
    return newVars;
  }

  private static deleteLocalFile(path: string) {
    if (existsSync(path)) {
      CenvLog.info(` - deleting ${CenvLog.colors.infoBold(relative(cenvRoot, path))}`)
      unlinkSync(path);
    }
  }

  private static getLocalCenvFiles(startPath: string = cenvRoot, environment?: string): LocalCenvFiles {
    const result: LocalCenvFiles = { config: [], envVars: [], globalEnvVars: [], vars: false, envVarTemplate: false, globalVars: false, globalEnvVarTemplate: false   };
    result.config = this.fromDir(startPath, environment ? new RegExp(/^\.cenv\.(${environment})\.config$/) : /^\.cenv\.[a-zA-Z0-9]*\.config$/, undefined);
    result.envVars = this.fromDir(startPath, environment ? new RegExp(/^\.cenv\.(${environment})$/) : /^\.cenv\.[a-zA-Z0-9]*$/, undefined);
    result.globalEnvVars = this.fromDir(CenvFiles.GLOBAL_PATH, environment ? new RegExp(/\.cenv\.(${environment})\.globals$/) : /\.cenv\.[a-zA-Z0-9]*\.globals$/, undefined);
    if (environment) {
      return result;
    }

    result.envVarTemplate = existsSync(EnvVarsFile.TEMPLATE_PATH.toString());
    result.vars = existsSync(AppVarsFile.PATH.toString());
    result.globalVars = existsSync(GlobalVarsFile.PATH.toString());
    result.globalEnvVarTemplate = existsSync(GlobalEnvVarsFile.TEMPLATE_PATH.toString());
    return result;
  }

  private static deleteFiles(files: string[]) {
    files.forEach(file => {
      this.deleteLocalFile(file);
    });
  }


  static freshPath(path: string) {
    if (!existsSync(path)) {
      rmSync(path, { recursive: true, force: true });
    }

    mkdirSync(path, { recursive: true });
  }
  static ensurePath(path: string) {
    if (!existsSync(path)) {
      mkdirSync(path, {recursive: true});
    }
  }

  static packagePaths: Record<string, string> = {};
  static stackPath(codifiedPackageName: string): string | false {
    const pkgComp = Package.getPackageComponent(codifiedPackageName);
    const result = this.packagePath(pkgComp.package, __dirname);
    if (!result || !result.length) {
      CenvLog.alert(`could not find the related files for the codified package name ${codifiedPackageName} `);
      return false;
    }

    const compResults = search_sync(result, true, true, pkgComp.component, {excludedDirs: ['cdk.out', 'node_modules', 'dist']}) as string[];
    if (!compResults || !compResults.length) {
      CenvLog.alert(`found the package ${pkgComp.package} could not find the related files for the codified package name ${codifiedPackageName} `);
      return false;
    }
    return compResults[0]
  }

  static packagePath(packageName: string, workingDirectory?: string, useCache = true): string | false {
    if (packageName === 'GLOBAL') {
      const pkgPath = this.getMonoRoot(workingDirectory, useCache);
      if (!pkgPath) {
        return false;
      }
      return pkgPath;
    }
    if (useCache && this.packagePaths[packageName]) {
      return this.packagePaths[packageName];
    }

    const cwd = this.getMonoRoot(workingDirectory, workingDirectory ? false : useCache);
    if (!cwd) {
      return false;
    }
    const packages = search_sync(cwd, false, true, 'package.json', {
      excludedDirs: ['cdk.out', 'node_modules','dist'],
    }) as string[];

    for (let i = 0; i < packages.length; i++) {
      let packagePath: any = packages[i].split('/');
      packagePath.pop();
      packagePath = packagePath.join('/');
      const name = require(packages[i]).name;
      if (!this.packagePaths[name]) {
        this.packagePaths[name] = packagePath;
      }
    }

    if (this.packagePaths[packageName]) {
      return this.packagePaths[packageName];
    }
    return false;
  }

  static getMonoRoot(workingDirectory = './', useCache = true) {
    if (useCache && this.packagePaths['root']) {
      return this.packagePaths['root'];
    }
    const searchResults = search_sync(workingDirectory, true, false, 'cenv.json', {fallBack: 'package.json'}) as searchSyncFallbackResults;
    if (!searchResults?.results.length && !searchResults.fallbacks.length) {
      return false;
    }
    const root = searchResults?.results.length ? searchResults?.results[0].split('/') : searchResults?.fallbacks[0].split('/');
    root.pop();
    const rootPath = path.resolve(root.join('/'));
    if (useCache) {
      this.packagePaths['root'] = rootPath;
    }
    return rootPath;
  }

  static getGuaranteedMonoRoot(workingDirectory = './', useCache = true): string {
    const rootPath = this.getMonoRoot(workingDirectory, useCache);
    if (!rootPath) {
      CenvLog.single.catchLog(`could not locate the suitePath because the cwd "${process.cwd()}" does not appear to be in a cenv repo`)
      process.exit(750)
    }
    return rootPath;
  }

  static getMonoRootName() {
    const root = this.getMonoRoot();
    if (!root) {
      // TODO: probably should throw error?
      return false;
    }
    return root.split('/').pop();
  }



  static getProbableMonoRoot() {
    const searchFallback = search_sync(process.cwd(), true, false, 'suites.json', { fallBack: 'package.json' }) as searchSyncFallbackResults;
    if (searchFallback.results && searchFallback.results.length) {
      return searchFallback.results[0];
    }

    if (searchFallback?.fallbacks?.length) {
      return this.getShortestPathCount(searchFallback.fallbacks);
    }
    return false;
  }

  static getShortestPathCount(paths: string[]) {
    if (!paths?.length) {
      CenvLog.single.catchLog('can not get shortest path from an empty array');
      process.exit(882);
    }
    const sortedPaths = paths.sort((a,b) => (a.split('/').length > b.split('/').length) ? 1 : ((b.split('/').length > a.split('/').length) ? -1 : 0))
    return sortedPaths[0];
  }


  static fromDir(startPath: string, filter: string | RegExp, foundMsg = '-- found: ', recursive = false) {
    if (!existsSync(startPath)) {
      console.log('no dir ', startPath);
      return [];
    }

    const files = readdirSync(startPath);
    const foundFiles: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const filename = path.join(startPath, files[i].toString());
      const stat = lstatSync(filename);
      if (stat.isDirectory() && recursive) {
        this.fromDir(filename, filter); //recurse
      } else if (filename.match(filter)) {
        if (foundMsg) {
          console.log(foundMsg, filename);
        }
        foundFiles.push(filename);
      }
    }
    return foundFiles;
  }

  static setGlobalPath(globalPath: string) {
    this.GlobalPath = globalPath;
  }

  static setPaths() {
    if (!process.env.HOME) {
      process.env.HOME = require('os').homedir();
    }

    console.log('setPaths','--setPaths--')

    if (!process.env.CENV_PROFILE_PATH) {
      let final = 'profiles';
      if (CenvFiles.ENVIRONMENT === 'test') {
        final = 'test-' + final;
      }
      process.env.CENV_PROFILE_PATH = path.join(process.env.HOME!, cenvRoot, final);
      this.ProfilePath = process.env.CENV_PROFILE_PATH;
      console.log('this.ProfilePath', this.ProfilePath)
      this.ensurePath(this.ProfilePath);
    }

    function ensure(folder: string, memberPath: string) {
      if (!memberPath) {
        memberPath = path.join(process.env.HOME!, cenvRoot, folder);
        CenvFiles.ensurePath(memberPath);
      }
    }

    ensure('gitTemp', this.GitTempPath);
    ensure('artifacts', this.ArtifactsPath);
    ensure('logs', this.LogPath);
    ensure('dump', this.DumpPath);
  }

  static async deleteFilesSearch(search: string | RegExp, options: any) {
    const monoRoot = this.getMonoRoot();
    if (!monoRoot) {
      // TODO: probably should throw error here
      return;
    }
    const results = search_sync(path.resolve(monoRoot), false, true, search, options,) as string[];
    for (let i = 0; i < results.length; i++) {
      const file = results[i];

      rmSync(file);
    }
  }
}
