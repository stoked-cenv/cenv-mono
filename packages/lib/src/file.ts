import {configDefaults,} from "./configDefaults";
import {join, relative} from "path";
import * as yaml from 'js-yaml';
import {existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync} from 'fs';
import {CenvLog, errorBold, errorDim, errorInfo, infoAlertBold, infoBold} from "./log";
import Ajv from "ajv";
import {prettyPrint} from "@base2/pretty-print-object";
import { fromDir, getMonoRoot, validateEnvVars } from './utils';
import {BaseCommandOptions, CenvParams} from "./params";
import {envVarToKey, pathToEnvVarKey} from './aws/parameterStore';
import {encrypt} from './aws/kms';
import {getConfig} from "./aws/appConfig";
import * as path from 'path';
import { Cenv } from './cenv';


const {appExt} = configDefaults;

const ajv = new Ajv({allErrors: true, verbose: true});

export const cenvRoot = './.cenv/';

class Settings {
  ApplicationName = '';
  EnvironmentName = '';
}

export class EnvConfig {
  ApplicationName = '';
  EnvironmentName = '';
  ApplicationId = '';
  EnvironmentId = '';
  ConfigurationProfileId = '';
  DeploymentStrategyId = '';
}

type DecryptedValue = `${'--DEC='}${string}`;
type EncryptedValue = `${'--ENC='}${string}`;
type StringValue = Exclude<string, EncryptedValue | DecryptedValue>;
type CenvValue = StringValue | EncryptedValue | DecryptedValue;
type ReservedNames = "newGlobal" | "global"
type ValidVarKey = Exclude<string, ReservedNames>;
export type VarList = { [key: string]: CenvValue }
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

interface Parameters {
  [key: string]: IParameter;
}

interface ParameterSet {
  app: Parameters;
  environment: Parameters;
  global: Parameters;
  globalEnv: Parameters;
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
        CenvLog.single.alertLog(`could not read ${process.cwd()}/${infoAlertBold(name)} the file doesn't exist`)
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
      CenvLog.info(` - saving ${infoBold(name)}`);
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
    const errorTitle = errorInfo(`${errorBold(typeTitle)}: [${errorBold(name)}] Parse Failed`);
    const logLine = '-'.repeat(80);
    const pathLine = errorInfo(`Path: ${join(path, name)}`);
    let log = `${pathLine}\n${logLine}\n${errorTitle}\n${logLine}\n\n`;
    for (let i = 0; i < errors.length; i++) {
      const error: any = errors[i];
      let pretty = prettyPrint(error, {
        transform: (obj, prop, originalResult) => {
          return prop === Object(prop) ? JSON.stringify(prop) : originalResult;
        }, singleQuotes: false
      });
      pretty = pretty.split('\n').join('\n\t\t');
      log += `\t\t${errorBold(error.message)}\n`;
      log += `\t\t${'-'.repeat(50)}\n`;
      log += '\t\t' + errorInfo(pretty);
      log += `\n\n`;

      log += logLine + '\n\n';
    }
    console.log(errorDim(log));
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
    const p = join(CenvFiles.GlobalPath as string, this.NAME as string);
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

  public static save(data: any, silent = false, name: string = this.NAME, path: string = CenvFiles.GlobalPath) {
    let merged = data;
    if (existsSync(this.PATH)) {
      const globalData = super.read(this.PATH, this.SCHEMA, false);
      merged = {...globalData, ...data};
    }
    if (!silent) {
      CenvLog.info(` - saving ${infoBold(name)}`);
    }
    const sortedObject: any = this.sortObjectKeys(merged);
    writeFileSync(join(path, name), yaml.dump(sortedObject));
  }
}

export class GlobalEnvVarsFile extends File {
  public static get PATH(): string {
    const p = join(CenvFiles.GlobalPath as string, this.NAME as string);
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
    return join(CenvFiles.GlobalPath, this.TEMPLATE);
  }

  public static get TEMPLATE(): string {
    return `${appExt}.env.globals.template`
  }

  public static save(data: any, silent = false, name: string = this.NAME, path: string = CenvFiles.GlobalPath) {
    let merged = data;
    if (existsSync(this.PATH)) {
      const globalData = super.read(this.PATH, this.SCHEMA, false);
      merged = {...globalData, ...data};
    }

    if (!silent) {
      CenvLog.info(` - saving ${infoBold(name)}`);
    }
    const sortedObject: any = this.sortObjectKeys(merged);
    writeFileSync(join(path, name), yaml.dump(sortedObject));
  }
}


export interface CleanCommandOptions extends BaseCommandOptions {
  mode?: string;
  allApplications?: boolean;
  globals?: boolean;
  environment?: string;
}


export class CenvFiles {
  //static envVars = validateEnvVars(['APPLICATION_NAME', 'ENVIRONMENT_NAME', 'HOME', 'ENV', 'CDK_DEFAULT_ACCOUNT', 'AWS_ACCOUNT_ID'])

  public static readonly ENVIRONMENT_TEMPLATE_TOKEN = '[--env--]';
  public static Settings: Settings;
  public static EnvConfig: EnvConfig;
  public static AppVars: AppVars = {};
  public static EnvVars: VarList = {};
  public static GlobalVars: VarList = {};
  public static GlobalEnvVars: VarList = {};
  public static GlobalPath: string | null = null;
  public static ProfilePath: string | null = null;
  public static GitTempPath: string | null = null;
  public static ArtifactsPath: string | null = null;
  private static path = cenvRoot;
  private static environment: string;

  public static get SESSION_PARAMS(): {
    ApplicationIdentifier: string, EnvironmentIdentifier: string, ConfigurationProfileIdentifier: string
  } {
    if (this.EnvConfig.ApplicationId === undefined || this.EnvConfig.EnvironmentId === undefined || this.EnvConfig.ConfigurationProfileId === undefined) {
      CenvLog.single.catchLog(['SESSION_PARAMS error', 'No config found']);
      process.exit();
    }
    return {
      ApplicationIdentifier: this.EnvConfig.ApplicationId,
      EnvironmentIdentifier: this.EnvConfig.EnvironmentId,
      ConfigurationProfileIdentifier: this.EnvConfig.ConfigurationProfileId,
    }
  }

  public static get PATH(): any {
    return this.path;
  }

  public static set PATH(path: string) {
    this.path = path;
  }

  public static get ENVIRONMENT(): any {
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
    const root = getMonoRoot();
    if (!root) {
      CenvLog.single.catchLog('can not find the primary package path because there is no mono repo');
      process.exit(799);
    }
    return join(root, Cenv.primaryPackagePath);

  }

  // load the environment config
  public static LoadEnvConfig(environment: string = process.env.ENV!) {
    this.ENVIRONMENT = environment;
    this.EnvConfig = File.read(EnvConfigFile.PATH, EnvConfigFile.SCHEMA, true) as EnvConfig;
    return this.EnvConfig;
  }

  public static GetConfig(environment?: string) {
    if (!this.EnvConfig || environment !== process.env.ENV) {
      this.LoadEnvConfig(environment);
    }

    return this.EnvConfig;
  }

  public static async GetVars(typed = false, decrypted = true) {
    if (!this.ENVIRONMENT) {
      this.ENVIRONMENT = process.env.ENV!;
    }
    if (!this.EnvConfig) {
      this.EnvConfig = File.read(EnvConfigFile.NAME, EnvConfigFile.SCHEMA, true) as EnvConfig;
    }
    if (!this.EnvConfig) {
      const res = await getConfig(process.env.APPLICATION_NAME!, process.env.ENVIRONMENT_NAME);
      if (!res) {

      }
    }
    await this.LoadVars(decrypted);
    const ret: any = {
      app: this.AppVars, environment: this.EnvVars, global: this.GlobalVars, globalEnv: this.GlobalEnvVars
    };
    if (typed) {
      return ret;
    }
    return {...ret.app, ...ret.environment, ...ret.global, ...ret.globalEnv};
  }

  public static async GetData() {
    this.LoadEnvConfig();
    await this.LoadVars(true);
    return {
      EnvConfig: this.EnvConfig, Vars: {
        app: this.AppVars, environment: this.EnvVars, global: this.GlobalVars, globalEnv: this.GlobalEnvVars
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

  public static SaveEnvConfig(config: EnvConfig) {
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
      GlobalVarsFile.save(vars.global, silent, GlobalVarsFile.NAME, CenvFiles.GlobalPath);
    }

    if (Object.keys(vars.globalEnv).length > 0) {
      GlobalEnvVarsFile.save(vars.globalEnv, silent, GlobalEnvVarsFile.NAME, CenvFiles.GlobalPath);
    }
  }

  public static Clean(startPath: string = cenvRoot, options?: CleanCommandOptions) {
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

  public static async createParameter(config: any, key: string, value: string, type: string, encrypted: boolean): Promise<{
    [x: string]: IParameter
  }> {
    const rootPath = CenvParams.GetRootPath(config.ApplicationName, config.EnvironmentName, type);
    if (encrypted) {
      value = await encrypt(value)
      value = `--ENC=${value}`
    }
    const param: IParameter = {Value: value, Type: 'String', ParamType: type, Name: key.toLowerCase()};
    return {[`${rootPath}/${key}`]: param};
  }

  public static async decodeParameter(paramName: string, paramValue: string, paramType: string, rootPath: string): Promise<{
    [x: string]: IParameter
  }> {

    const param: IParameter = {Value: paramValue, Type: 'String', ParamType: paramType, Name: paramName};
    return {[`${rootPath}/${paramName}`]: param};
  }

  public static AllTyped(paramSet: ParameterSet) {
    return {
      app: (this.encodeParameters(paramSet.app)),
      environment: (this.encodeParameters(paramSet.environment)),
      global: (this.encodeParameters(paramSet.global)),
      globalEnv: (this.encodeParameters(paramSet.globalEnv))
    };
  }

  private static Load(): void {
    this.LoadEnvConfig();
    this.LoadVars();
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

  private static async LoadVars(decrypted = true) {
    const appData = File.read(AppVarsFile.PATH, AppVarsFile.SCHEMA, true) as AppVars;
    const envVarTemplate = File.read(EnvVarsFile.TEMPLATE_PATH, EnvVarsFile.SCHEMA, true) as VarList;
    this.EnvVars = File.read(EnvVarsFile.PATH, EnvVarsFile.SCHEMA, true) as VarList;
    this.EnvVars = {...envVarTemplate, ...this.EnvVars};
    const allGlobals = File.read(GlobalVarsFile.PATH, GlobalVarsFile.SCHEMA, true) as VarList;
    const allGlobalEnvVars = File.read(GlobalEnvVarsFile.PATH, GlobalEnvVarsFile.SCHEMA, true) as VarList;
    const globals: any = {};

    if (appData?.global) {
      for (let i = 0; i < appData.global?.length; i++) {
        const globalVar = appData.global[i];
        if (allGlobals && allGlobals[globalVar]) {
          globals[globalVar] = allGlobals[globalVar];
        }
      }
      delete appData.global;
    }

    const globalEnvs: any = {};
    if (appData?.globalEnv) {
      for (let i = 0; i < appData.globalEnv?.length; i++) {
        const globalEnvVar = appData.globalEnv[i];
        if (allGlobalEnvVars && allGlobalEnvVars[globalEnvVar]) {
          globalEnvs[globalEnvVar] = allGlobalEnvVars[globalEnvVar];
        }
      }
      delete appData.globalEnv;
    }
    this.GlobalVars = globals;
    this.GlobalEnvVars = globalEnvs;
    this.AppVars = appData;
    if (decrypted) {
      const roots = CenvParams.GetRootPaths(this.EnvConfig.ApplicationName, this.EnvConfig.EnvironmentName);
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
      CenvLog.info(` - deleting ${infoBold(relative(cenvRoot, path))}`)
      unlinkSync(path);
    }
  }

  private static getLocalCenvFiles(startPath: string = cenvRoot, environment?: string) {

    const config = fromDir(startPath, environment ? new RegExp(/^\.cenv\.(${environment})\.config$/) : /^\.cenv\.[a-zA-Z0-9]*\.config$/, undefined);
    const envVars = fromDir(startPath, environment ? new RegExp(/^\.cenv\.(${environment})$/) : /^\.cenv\.[a-zA-Z0-9]*$/, undefined);
    const globalEnvVars = fromDir(CenvFiles.GlobalPath, environment ? new RegExp(/\.cenv\.(${environment})\.globals$/) : /\.cenv\.[a-zA-Z0-9]*\.globals$/, undefined);
    if (environment) {
      return {config, envVars, globalEnvVars};
    }

    const envVarTemplate = existsSync(EnvVarsFile.TEMPLATE_PATH.toString());
    const vars = existsSync(AppVarsFile.PATH.toString());
    const globalVars = existsSync(GlobalVarsFile.PATH.toString());
    const globalEnvVarTemplate = existsSync(GlobalEnvVarsFile.TEMPLATE_PATH.toString());
    return {vars, config, envVars, globalVars, envVarTemplate, globalEnvVars, globalEnvVarTemplate}
  }

  private static deleteFiles(files: string[]) {
    files.forEach(file => {
      this.deleteLocalFile(file);
    });
  }

  private static encodeParameter(parameter: IParameter) {
    return parameter.Value ? parameter.Value : parameter
  }

  private static encodeParameters(parameters: Parameters) {
    const result: any = {};
    if (parameters) {
      for (const [key, value] of Object.entries(parameters)) {
        result[key] = this.encodeParameter(value);
      }
      return result;
    }
    return undefined;
  }

  static ensurePath(path: string) {
    if (!existsSync(path)) {
      mkdirSync(path, {recursive: true});
    }
  }

  static setPaths() {
    if (!process.env.HOME) {
      process.env.HOME = require('os').homedir();
    }

    if (!process.env.CENV_PROFILE_PATH) {
      process.env.CENV_PROFILE_PATH = path.join(process.env.HOME, cenvRoot, 'profiles');
      this.ProfilePath = process.env.CENV_PROFILE_PATH;
      this.ensurePath(this.ProfilePath);
    }

    if (!this.GitTempPath) {
      this.GitTempPath = path.join(process.env.HOME, cenvRoot, 'gitTemp');
      this.ensurePath(this.GitTempPath);
    }

    if (!this.ArtifactsPath) {
      this.ArtifactsPath = path.join(process.env.HOME, cenvRoot, 'artifacts');
      this.ensurePath(this.ArtifactsPath);
    }

  }
}
