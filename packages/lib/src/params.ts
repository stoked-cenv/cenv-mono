import {
  createApplication, createConfigurationProfile,
  createEnvironment,
  deleteCenvData,
  deployConfig,
  getApplication,
  getConfigurationProfile,
  getDeploymentStrategy,
  getEnvironment,
} from './aws/appConfig';
import {
  decryptValue,
  deleteParameters,
  envVarToKey,
  getParameter,
  getParametersByPath,
  getParams,
  getVarsByType,
  isEncrypted,
  putParameter,
  stripPath,
  updateTemplates,
  upsertParameter
} from './aws/parameterStore';
import {invoke, updateLambdas} from './aws/lambda';
import {CenvLog} from './log';
import {getConfigVars} from './aws/appConfigData';

import {expandTemplateVars, sleep,} from './utils';
import { AppVarsFile, CenvFiles, EnvConfig, EnvVarsFile, GlobalEnvVarsFile, GlobalVarsFile, search_sync } from './file';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import {Package} from './package/package';
import {Environment} from "./environment";
import {ProcessMode} from "./package/module";
import { Cenv, ParamsCommandOptions } from './cenv';
import { ioAppEnv, ioReadVarList, readAsync } from './stdio';
import path from 'path';
import { execCmd } from './proc';

export const variableTypes = ['app', 'environment', 'global', 'globalEnv'];

export function filteredCount(options: string[], types: string[]) {
  const filtered = options.filter(el => {
    return types.indexOf(el.replace('Type', '')) > -1;
  });
  return filtered;
}


interface FlagValidation {
  application: string;
  environment: string;
  options: any;
  envConfig: EnvConfig;
}

export function validateCount(options: string[], types: string[], silent = false) {
  const filtered = filteredCount(options, types);
  const valid = filtered.length === 1;
  if (!valid && !silent) {
    if (filtered.length === 0) {
      console.log(CenvLog.colors.error('The command did not include parameter type.'));
    } else {
      console.log(CenvLog.colors.error('The command included more than one type - included: ' + filtered.join(', ')));
    }
  }
  return valid ? filtered[0].replace('Type', '') : false;
}

export function validateOneType(options: string[]) {
  return validateCount(options, variableTypes);
}

export function validateZeroOrOneType(options: string[]) {
  return validateCount(options, variableTypes);
}

export interface LambdaProcessResponse {
  before?: string,
  after?: string,
  error?: Error
}

export declare class Dashboard {
}


export interface DashboardCreateOptions {
  packages?: Package[],
  suite?: string,
  environment?: Environment
  options: any,
  cmd?: ProcessMode
}



export class CenvParams {

  static async removeParameters(params: any, options: any, types: string[], exitOnFail = true) {
    const resLinks = await this.buildDataRemoveLinks(params, options, types, exitOnFail);
    if (resLinks) {
      await CenvParams.removeParameter(params, options, resLinks.paramData, resLinks.rootPaths, resLinks.inCenvRoot, resLinks.cenvPackage);
    }
  }

  static async removeAll(varTypes: any, rootPaths: string[], type: string, pkg: Package) {
    let totalRemoved = 0;
    for (let j = 0; j < varTypes.length; j++) {
      await sleep(4);
      const varType = varTypes[j];
      const typed = type === varType
      if (typed || !type) {
        const typedVars = await getVarsByType(varType, rootPaths[varType], false);
        const values = Object.values(typedVars);
        const paths = values.map((v: any) => v.Path);
        if (paths.length) {
          await deleteParameters(paths);
          totalRemoved += paths.length;
          CenvLog.single.infoLog(`removed all ${CenvLog.colors.infoBold(paths.length)} ${CenvLog.colors.infoBold(varType)} parameters${' related to ' + pkg}`);
        } else if (type) {
          CenvLog.single.alertLog(`attempted to remove all the ${type} parameters but none were found`)
        }
        if (typed) {
          process.exit();
        }
      }

    }
    if (!totalRemoved) {
      CenvLog.single.alertLog(`attempted to remove all the parameters but none were found`)
    }
  }

  static async buildDataRemoveLinks(params: any, options: any, types: string[], exitOnFail = true) {
    try {
      await sleep(3);

      if (params.length && options?.all) {
        CenvLog.single.errorLog('You must not specify variables to delete with the --all flag');
        process.exit(2);
      }

      await sleep(3);

      const config = CenvFiles.GetConfig();
      let inCenvRoot = true;
      let cenvPackage;
      if (!config) {
        inCenvRoot = false;
      } else {
        cenvPackage = Package.getPackageName();
      }
      const type = types[0];

      const paramData: {type: string, root: string, key: string, path: string, envVar: any}[] = [];
      const varTypes = inCenvRoot ? variableTypes : ['global', 'globalEnv'];
      const vars: any = {};
      const rootPaths: any = inCenvRoot ? CenvParams.GetRootPaths(config.ApplicationName, config.EnvironmentName) : {
        global: `/global/${process.env.ENV}`,
        globalEnv: `/globalenv/${process.env.ENV}`
      };

      if (options?.all) {
        await this.removeAll(varTypes, rootPaths, type, cenvPackage)
        //CenvLog.single.catchLog(new Error('removeAll'));
        process.exit(0);
      }

      for (let i = 0; i < params.length; i++) {
        let found = false;
        const param = params[i];
        const paramEnvVar = envVarToKey(param);
        for (let j = 0; j < varTypes.length; j++) {
          const varType = varTypes[j];
          if (type !== varType && type) {
            continue;
          }
          const varTypeRoot = rootPaths[varType];
          const typedParams = await getParametersByPath(`${varTypeRoot}`);
          vars[varType] = typedParams;
          for (let k = 0; k < Object.keys(typedParams).length; k++) {
            const typedParamKey = Object.keys(typedParams)[k];
            const typedParam = typedParams[typedParamKey];
            if (typedParam.Name === paramEnvVar) {
              paramData.push({
                               type: varType,
                               root: varTypeRoot,
                               key: envVarToKey(param),
                               path: typedParamKey,
                               envVar: param
                             });

              if ((varType === 'globalEnv' || varType === 'global') && !options?.kill && !inCenvRoot) {
                CenvLog.single.errorLog('Must use --kill flag with rm for global and globalEnv variables');
                process.exit(3);
              }
              found = true;
              break;
            }
          }
          if (found) {
            break;
          }
        }
        if (found) {
          break;
        } else {
          if (exitOnFail) {
            if (inCenvRoot) {
              CenvLog.single.errorLog(`${param} does not exist in this package ${process.cwd()}`);
              process.exit(4);
            } else {
              CenvLog.single.errorLog(`${param} does not exist in the current env: ${process.env.ENV}`);
              process.exit(5);
            }
          } else {
            CenvLog.single.errorLog(`${param} does not exist in this package ${process.cwd()}`);
          }
        }
      }
      return {cenvPackage, paramData, rootPaths, inCenvRoot};
    } catch (e) {
      CenvLog.single.catchLog(new Error('buildDataRemoveLinks'))
    }
  }


  static async removeParameter(params: string[], options: any, paramData: any, rootPaths: any, inCenvRoot: boolean, cenvPackage: string) {
    const linksUpdated: string[] = [];
    const linksAttempted: string[] = []
    const paramsUpdated: string[] = [];

    if (options?.kill) {
      const killItWithFire = await readAsync('The --kill flag removes the global parameter entirely. Any services that depend on it will be broken. Are you sure you want to delete the global parameter? (y/n): ', 'n');
      if (killItWithFire !== 'y') {
        console.log(CenvLog.colors.error('The global parameter was not deleted. If you simply want to remove the reference from this application to the global parameter use the same command without --kill.'));
        process.exit(6);
      }
    }

    for (let i = 0; i < paramData.length; i++) {
      const pdata = paramData[i];
      if (inCenvRoot && (pdata.type === 'global' || pdata.type === 'globalEnv')) {
        linksAttempted.push(params[i])
        const rootLink = rootPaths[pdata.type + 'Link'];
        const linkVars = await getParameter(rootLink, true);
        if (linkVars) {
          const newLinkVarPaths: string[] = [];
          const linkVarPaths = linkVars[rootLink].Value.split(',');
          for (let j = 0; j < linkVarPaths.length; j++) {
            const linkVarPath = linkVarPaths[j];
            let inParams = false;
            const paramPath = `${rootPaths[pdata.type]}/${envVarToKey(pdata.key)}`;
            if (linkVarPath === paramPath) {
              linksUpdated.push(params[i])
              inParams = true;
            }
            if (!inParams) {
              newLinkVarPaths.push(linkVarPath);
            }
          }
          // update globalLink to not include references to the parameters just passed in
          if (newLinkVarPaths.length === 0) {
            await deleteParameters([rootLink]);
          } else {
            await putParameter(rootLink, newLinkVarPaths.join(','), true);
          }

        }
        if (options?.kill) {
          await deleteParameters([`${rootPaths[pdata.type]}/${envVarToKey(params[i])}`])
          paramsUpdated.push(params[i]);
        }
      } else {
        await deleteParameters([`${rootPaths[pdata.type]}/${envVarToKey(params[i])}`])
        paramsUpdated.push(params[i]);
      }
      await updateTemplates(false, params[i], pdata.type);
    }
    if (linksUpdated.length > 0) {
      CenvLog.single.infoLog(`deleted link(s): [${CenvLog.colors.infoBold(linksUpdated.join(', '))}]`);
    }
    if (linksUpdated.length !== linksAttempted.length) {
      const remaining = linksAttempted.filter(p => !linksUpdated.includes(p));
      CenvLog.single.alertLog(`attempted to remove link(s) [${CenvLog.colors.alertBold(remaining.join(', '))}] from ${cenvPackage} but ${remaining.length > 1 ? 'they were' : 'it was'} not found`)
    }
    if (paramsUpdated.length > 0) {
      CenvLog.single.infoLog(`deleted: [${CenvLog.colors.infoBold(paramsUpdated.join(', '))}]`);
    }
    if (!options?.kill) {
      if (paramsUpdated.length || linksUpdated.length) {
        await CenvParams.pull(false, false, true);
      }
    }
  }

  static async getParamsContext() {
    const packageName = Package.getPackageName();
    const pkg = await Package.fromPackageName(packageName);
    if (pkg.params?.hasCenvVars) {
      const envCtx: any = await CenvFiles.GetData();
      if (!envCtx || !envCtx.EnvConfig) {
        process.exit(0);
      }
      envCtx.pkg = pkg;
      return envCtx;
    }
    return {pkg};
  }

  public static GetRootPath(ApplicationName: string, EnvironmentName: string, type: string) {
    const paths: any = this.GetRootPaths(ApplicationName, EnvironmentName);
    return paths[type];
  }

  public static GetRootPaths(ApplicationName: string, EnvironmentName: string): {
    app: string,
    globalLink: string,
    global: string,
    globalEnvLink: string,
    globalEnv: string,
    environment: string,
    generate: string
  } {
    const app = stripPath(ApplicationName);
    const env = stripPath(EnvironmentName);
    return {
      app: stripPath(`/service/${app}/app`),
      globalLink: stripPath(`/service/${app}/global`),
      global: stripPath(`/global`),
      globalEnvLink: stripPath(`/service/${app}/globalenv/${env}`),
      globalEnv: stripPath(`/globalenv/${env}`),
      environment: stripPath(`/service/${app}/environment/${env}`),
      generate: stripPath(`/service/${app}/generate`)
    };
  }

  static async push(materialize: boolean, decrypted = false): Promise<void> {
    const config = CenvFiles.GetConfig();
    if (!config) {
      CenvLog.single.errorLog('no local variables found to push');
      return;
    }

    CenvLog.single.infoLog(`pushing ${CenvLog.colors.infoBold(config.EnvironmentName)} variables to cloud`);

    let updatedCount = 0;
    const data = await CenvFiles.GetVars(true, decrypted);
    updatedCount = await this.pushType(data, 'app', config, updatedCount);
    updatedCount = await this.pushType(data, 'environment', config, updatedCount);
    updatedCount = await this.pushType(data, 'global', config, updatedCount);
    updatedCount = await this.pushType(data, 'globalEnv', config, updatedCount);

    let parametersVerified = false;
    const condensed = {...data.app, ...data.environment, ...data.global, ...data.globalEnv};
    let count = 2;
    while (!parametersVerified || count === 0) {
      const params = await getParams(config, 'all', 'simple', true, false, true)
      let matching = true;
      const unmatched: any = {existing: {}, updated: {}};
      for (let i = 0; i < Object.keys(params).length; i++) {
        const key = Object.keys(params)[i];
        const param = params[key];
        let compare = condensed[key];
        if (isEncrypted(condensed[key] as string)) {
          const decrypted = await decryptValue(condensed[key])
          console.log('decrypted', decrypted);
          compare = decrypted;
        }
        if (param !== compare) {
          unmatched.existing[key] = param;
          unmatched.updated[key] = compare
          matching = false;
        }
      }
      parametersVerified = matching;
      if (!parametersVerified) {
        await sleep(10);
        CenvLog.single.alertLog('sleeping for 5 seconds to wait for consistency in parameter store before materialization', config.ApplicationName);
        CenvLog.single.alertLog(JSON.stringify(unmatched, null, 4));
        count--;
      }
    }
    if (count === 0) {
      CenvLog.single.catchLog('the parameter store did not become consistent with the data that we pushed even after 2 tries.. deploy failed');
    }

    if (!updatedCount) {
      CenvLog.single.infoLog(`${process.env.ENV} application configuration parameters are up to date`);
      return;
    } else {
      console.log(CenvLog.chalk.green(`updated ${updatedCount} parameters`));
    }

    if (materialize) {
      await this.Materialize();
    }
  }

  static async mergeDataType(file: any, vars: any, type: string) {

    let fileData: Record<string, string> = {};
    let changed = false;

    if (!process.env.CENV_PARAMS_EXTRACTION_TEST && existsSync(file.PATH)) {
      fileData = file.read(file.PATH, file.SCHEMA, true);
    }

    if (type === 'envTemplate' || type === 'globalEnvTemplate') {
      if (!fileData && existsSync(file.TEMPLATE_PATH)) {
        fileData = file.read(file.TEMPLATE_PATH, file.SCHEMA, true);
        if (!fileData) {
          return {vars, changed};
        }
        console.log('fileData', fileData);
        if (type === 'globalEnvTemplate') {
          delete fileData['ENVIRONMENT_NAME'];
        }
        if (!process.env.CENV_LOCAL && !process.env.CENV_DEFAULTS) {
          fileData = await ioReadVarList(fileData, true);
        }
        if (type === 'globalEnvTemplate') {
          fileData['ENVIRONMENT_NAME'] = process.env.ENV!;
        }
      }
    }

    if (!fileData) {
      return {vars, changed: false};
    }

    if (process.env.CENV_PARAMS_EXTRACTION_TEST) {
      const preTest = {...fileData};
      CenvLog.single.infoLog(`${file.NAME} before template expansion:\n ${JSON.stringify(fileData, null, 2)}`)
      fileData = expandTemplateVars(fileData);
      CenvLog.single.infoLog(`${file.NAME} after template expansion:\n ${JSON.stringify(fileData, null, 2)}`)
      fileData = preTest;
    }

    if (JSON.stringify(fileData) != JSON.stringify(vars)) {
      changed = true;
    }
    vars = {...vars, ...fileData};
    return {vars, changed};
  }

  static async pull(materialized = false, decrypted = false, silent = false, init = false, push = true, save = true, config?: EnvConfig, allValues = false) {
    let data = config;
    if (!data) {
      data = await CenvFiles.GetConfig();
    }

    let variables;
    if (!materialized) {
      variables = await getParams(data, 'allTyped', 'simple', decrypted, materialized, silent);
    } else {

      const options = {
        ApplicationId: data.ApplicationId,
        EnvironmentId: data.EnvironmentId,
        ConfigurationProfileId: data.ConfigurationProfileId,
        AllValues: allValues ? allValues : undefined
      };

      variables = await getConfigVars(allValues, silent, 'PULLED DEPLOYED VARS');
    }

    // merge app data
    if (init) {
      const mergeAppDataRes = await this.mergeDataType(AppVarsFile, variables.app, 'baseVariables');
      variables.app = mergeAppDataRes.vars;

      const mergeEnvDataRes = await this.mergeDataType(EnvVarsFile, variables.environment, 'envTemplate');
      variables.environment = mergeEnvDataRes.vars;

      const mergeGlobalEnvDataRes = await this.mergeDataType(GlobalEnvVarsFile, variables.globalEnv, 'globalEnvTemplate');
      variables.globalEnv = mergeGlobalEnvDataRes.vars;

      const mergeGlobalDataRes = await this.mergeDataType(GlobalVarsFile, variables.global, 'globalVariables');
      variables.global = mergeGlobalDataRes.vars;

      const changed = mergeAppDataRes.changed || mergeEnvDataRes.changed || mergeGlobalEnvDataRes.changed || mergeGlobalDataRes.changed
      if (save || changed) {
        CenvFiles.SaveVars(variables, data.EnvironmentName, false);
      }
      if (push || changed) {
        await this.push(true, false);
      }
    } else if (Object.keys(variables).length > 0) {
      if (save) {
        CenvFiles.SaveVars(variables, data.EnvironmentName, false);
      }
    } else {
      CenvLog.single.alertLog(`no variables configured for the ${CenvLog.colors.alertBold(data.EnvironmentName)} environment`)
    }
    return variables;
  }

  public static async Materialize(test = false) {
    const data: any = CenvFiles.GetConfig();
    if (!data) {
      return;
    }

    if (test) {
      const res = await this.MaterializeCore(data);
      CenvLog.single.verboseLog('materialization test results:\n' + res);
    } else {
      const {before, after, error} = await invoke('cenv-params', JSON.stringify(data))
      if (error) {
        CenvLog.single.errorLog(JSON.stringify(error, null, 2));
        return;
      }

      if (before) {
        let output = '';
        for (const [beforeKey, beforeValue] of Object.entries(before) as [string, string][]) {
          for (const [afterKey, afterValue] of Object.entries(after) as [string, string][]) {
            if (afterKey === beforeKey) {
              output += `'${CenvLog.colors.infoBold(afterKey)}': '${CenvLog.colors.infoBold(afterValue)}' ${(process.env.CENV_LOG_LEVEL === 'VERBOSE' && beforeValue !== afterValue) ? `- ${CenvLog.chalk.green(beforeValue)}` : ''}\n`;
            }
          }
        }
        CenvLog.single.infoLog('materialization results:\n' + output, data.ApplicationName);
      }
    }
  }

  public static getMaterializedMeta(materializedVars: Record<string, string>, before: Record<string, string>) {
    const from: Record<string, string> = {};
    for (const [key, value] of Object.entries(materializedVars) as [string, string][]) {
      if (before?.app[key as keyof object] !== value) {
        from[key] = 'app';
      }
      if (before?.environment[key as keyof object] !== value) {
        from[key] = 'environment';
      }
      if (before?.globalEnv[key as keyof object] !== value) {
        from[key] = 'globalEnv';
      }
      if (before?.global[key as keyof object] !== value) {
        from[key] = 'global';
      }
    }
    return from;
  }

  public static async MaterializeCore(event: any = undefined): Promise<LambdaProcessResponse> {
    try {
      const {
        ApplicationId, EnvironmentId, ConfigurationProfileId, ApplicationName, EnvironmentName, DeploymentStrategyId
      } = event;

      if (!ApplicationName || !EnvironmentName || !ApplicationId || !EnvironmentId || !ConfigurationProfileId || !DeploymentStrategyId) {
        console.log('Missing required parameters in event');
        return {error: new Error('Missing required parameters in event')}
      }

      const appConfig = {
        ApplicationId, EnvironmentId, ConfigurationProfileId, ApplicationName, EnvironmentName, DeploymentStrategyId
      };
      const configMeta = await getConfigurationProfile(ApplicationId, 'config_meta');
      let appConfigMeta;
      if (configMeta && configMeta.ConfigurationProfileId) {
        appConfigMeta = {
          ApplicationId, EnvironmentId, ConfigurationProfileId: configMeta.ConfigurationProfileId, ApplicationName, EnvironmentName, DeploymentStrategyId
        };
      }
      if (process.env.VERBOSE_LOGS) {
        console.log('appConfig', appConfig)
      }
      // materialize the new app vars from the parameter store using the app config as input
      let materializedVars = await getParams(appConfig, 'all', 'simple', true, false, true);

      // expand template variables
      const before = JSON.parse(JSON.stringify(materializedVars));
      if (process.env.VERBOSE_LOGS) {
        console.log('before rendering templates', JSON.stringify(before, null, 2));
      }
      //let output = JSON.stringify(materializedVars, null, 2)
      materializedVars = expandTemplateVars(materializedVars);

      const after = materializedVars;

      if (process.env.VERBOSE_LOGS) {
        console.log('after rendering templates', JSON.stringify(after, null, 2));
      }

      // deploy the materialized vars to a new config profile version
      await deployConfig(materializedVars, appConfig);
      await updateLambdas(materializedVars, `${EnvironmentName}-${ApplicationName.replace(Cenv.scopeName, '')}`);

      if (appConfigMeta) {
        // deploy the materialized vars to a new config profile version
        const materializedMeta = this.getMaterializedMeta(materializedVars, before);
        await deployConfig(materializedMeta, appConfigMeta);
      }
      return {before, after}
    } catch (e) {
      CenvLog.single.errorLog('Cenv.MaterializeCore err: ' + e as string)
      return {error: e as Error};
    }
  }

  private static async pushType(vars: any, type: string, config: any, updatedCount: number) {
    if (vars[type]) {
      const rootPath = this.GetRootPath(config.ApplicationName, config.EnvironmentName, type);
      for (const [key, value] of Object.entries(vars[type])) {

        const parameter = await CenvFiles.decodeParameter(envVarToKey(key), value as string, type, rootPath);
        const res = await upsertParameter(config, parameter, type);
        if (res !== 'SKIPPED') {
          updatedCount += 1;
        }
      }
    }
    return updatedCount;
  }


  static addParam = async (pkg: Package, params: string[], options: Record<string, any>) => {
    function getAddParam(application: string) {
      return `cenv add ${application ? application + ' ' : ''}${options?.app ? '-a' : ''} ${options?.environment ? '-e' : ''} ${options?.global ? '-g' : ''} ${options?.globalEnv ? '-ge' : ''}`;
    }

    const cmd = pkg.createCmd(getAddParam(pkg.packageName));
    const type = validateOneType(Object.keys(options));
    if (!type) {
      cmd.err(`Must contain at least one type flag (${CenvLog.colors.infoBold('--app-type')}, ${CenvLog.colors.infoBold('--environment-type')}, 
        ${CenvLog.colors.infoBold('--global-type')}, ${CenvLog.colors.infoBold('--global-env-type')}`);
      cmd.result(2);
      return cmd;
    }
    let value: string | null = null;
    if (params.length === 2) {
      value = params[1];
    }

    if (!value && type !== 'global' && type !== 'globalEnv') {
      const error = `Must use the [value] argument if type is not --global or --global-environment.`;
      cmd.err(error);
      cmd.result(3);
      return cmd;
    }
    if (!pkg.chDir()) {
      return;
    }

    if (!value) {
      CenvLog.single.catchLog(new Error(`can not create a parameter without a valid value - key name ${params[0]}`));
      process.exit(912);
    }

    const ctx: any = await CenvParams.getParamsContext();
    const config = ctx.EnvConfig;
    const key = params[0].toLowerCase().replace(/_/g, '/');
    const keyPath = CenvParams.GetRootPath(ctx.EnvConfig.ApplicationName, ctx.EnvConfig.EnvironmentName, type);
    const alreadyExistingType = await CenvFiles.KeyExists(key, keyPath, type);
    if (alreadyExistingType) {
      const error = `Attempted to add key "${CenvLog.colors.errorBold(key)}" as ${type === 'global' ? 'a' : 'an'} "${CenvLog.colors.errorBold(type)}" param type, but this key already exists as ${alreadyExistingType === 'global' ? 'a' : 'an'} "${CenvLog.colors.errorBold(alreadyExistingType)}" param`;
      cmd.err(error);
      cmd.result(4);
      return cmd;
    }

    const parameter = await CenvFiles.createParameter(config, key, value, type, options.decrypted);
    const res = await upsertParameter(config, parameter, type);
    await new Promise((r) => setTimeout(r, 2000));
    if (res !== 'SKIPPED') {
      await new Promise((r) => setTimeout(r, 2000));
      await CenvParams.pull(false, false, false);
    }
    if (options?.stack) {
      cmd.out(`deploying ${CenvLog.colors.infoBold(config.ApplicationName)} configuration to environment ${CenvLog.chalk.blueBright(config.EnvironmentName)}`);
      await CenvParams.Materialize();
    }
    cmd.out('success');
    cmd.result(0);
    return cmd;
  };

  public static async setEnvironment(environment: string, config: any) {
    if (!config) {
      config = CenvFiles.GetConfig(environment);
    }
    const env = await getEnvironment(config.ApplicationId, environment, false);
    if (!env) {
      process.exit(0);
    }
    CenvLog.info(environment, 'environment set to');
    config.EnvironmentName = environment;
    config.EnvironmentId = env.EnvironmentId;
    await CenvFiles.SaveEnvConfig(config);
  }

  static async envToParamsAdd(path: string, envConfig: EnvConfig, type: string) {
    if (!existsSync(path)) {
      return false;
    }
    const envData = readFileSync(path, 'utf-8');
    const lines = envData.split('\n');
    const pkg = Package.fromPackageName(envConfig.ApplicationName);
    await Promise.all(lines.map(async (line: string) => {
      const keyValue = line.split('=');
      if (keyValue.length === 2) {
        const key = keyValue[0].trim();
        const value = keyValue[1].trim();
        if (key.length > 1 && value.length > 1) {
          await this.addParam(pkg, [key, value], { [type]: true });
        }
      }
    }));
    return true;
  }

  static async envToParams(envConfig: EnvConfig): Promise<void> {
    let envFile = path.join(process.cwd(), `.env.${process.env.ENV}`);
    await this.envToParamsAdd(envFile, envConfig, 'appType');

    envFile = path.join(process.cwd(), '.env');
    await this.envToParamsAdd(envFile, envConfig, 'environmentType');
  }

  static async initParams(options?: ParamsCommandOptions, tags: string[] = []) {
    try {
      const flagValidateResponse = this.initFlagValidation(options);

      let { application, environment, envConfig } = flagValidateResponse;
      options = flagValidateResponse.options;

      if (!(await Cenv.verifyCenv())) {
        await Cenv.deployCenv();
      }

      const appEnvNameRes = await this.processApplicationEnvironmentNames(options as Record<string, string>, application, environment, envConfig);
      if (!appEnvNameRes) {
        CenvLog.single.catchLog('could not determine the env config data');
        process.exit(533);
      }

      application = appEnvNameRes.application;
      environment = appEnvNameRes.environment;

      const processAppRes = await this.processApplication(application, environment);
      envConfig = processAppRes.envConfig;
      const createdApp = processAppRes.createdApp;

      const processEnvRes = await this.processEnvironment(envConfig, application, environment);
      envConfig = processEnvRes.envConfig;
      const createdEnv = processEnvRes.createdEnv;

      const confProf = await this.processConfigurationProfile(envConfig);
      if (!confProf) {
        CenvLog.single.errorLog('could not look up the params configuration from the envConfig: ' + JSON.stringify(envConfig, null, 2));
        return;
      }
      await this.processInitData(confProf, options as Record<string, string>);

    } catch (err) {
      CenvLog.single.catchLog('Cenv.init err: ' + (err instanceof Error ? err.stack : err));
    }
  }

  public static async destroyAppConfig(application: string, options: Record<string, any>) {
    await deleteCenvData(application, options?.parameters || options?.all, options?.config || options?.all, options?.all || options?.global);
    return true;
  }


  private static async processApplicationEnvironmentNames(options: Record<string, any>, application: string, environment: string, envConfig: EnvConfig) {
    const pkgPath = search_sync(process.cwd(), true) as string[];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require(pkgPath[0].toString());

    if (!environment && process.env.ENV) {
      environment = process.env.ENV;
    }

    if (!application || !environment || options?.force) {
      const appEntry = { value: application, defaultValue: pkg.name };
      const envEntry = { value: environment, defaultValue: 'local' };
      const ioAppEnvRes = await ioAppEnv(envConfig, appEntry, envEntry, options?.force, options?.defaults);
      if (!ioAppEnvRes) {
        return;
      }
      application = ioAppEnvRes.application;
      environment = ioAppEnvRes.environment;
    }

    /*if (
      envConfig?.ApplicationName !== undefined &&
      application !== undefined &&
      envConfig?.ApplicationName !== application &&
      !options?.force
    ) {
      //const destroyIt = await ioYesOrNo(
      //  `The service has previously been configured with the application name ${envConfig?.ApplicationName}. Would you like to destroy the previously configured application, all of it's related resources, as well as the local configuration?`,
      //);
      //if (destroyIt) {
      //  await pkg.params.destroy({}, )
      //}
      //return { application, environment };
    }*/
    return { application, environment };
  }

  private static async processApplication(application: string, environment: string) {
    let createdApp = false;
    const envConfig: any = {};
    const appRes = await getApplication(application, true);
    envConfig.ApplicationName = application;
    envConfig.EnvironmentName = environment;
    if (!appRes) {
      createdApp = true;
      const app = await createApplication(application);
      envConfig.ApplicationId = app.Id;

      const parameter = await CenvFiles.createParameter(envConfig, 'application/name', application, 'app', false);
      const res = await upsertParameter(envConfig, parameter, 'app');
    } else {
      envConfig.ApplicationId = appRes.ApplicationId;
    }
    return { createdApp, envConfig };
  }

  private static async processEnvironment(envConfig: EnvConfig, application: string, environment: string) {
    let createdEnv = false;
    envConfig.EnvironmentName = environment;
    const existingEnv = await getEnvironment(envConfig.ApplicationId, environment, true);

    if (!existingEnv) {
      createdEnv = true;
      const env = await createEnvironment(envConfig.ApplicationId, environment);
      envConfig.EnvironmentId = env.Id;

      const parameter = await CenvFiles.createParameter(envConfig, 'environment/name', environment, 'globalEnv', false);
      const res = await upsertParameter(envConfig, parameter, 'globalEnv');
    } else {
      envConfig.EnvironmentId = existingEnv.EnvironmentId;
    }
    return { createdEnv, envConfig };
  }

  private static async processConfigurationProfile(envConfig: EnvConfig) {
    const confProf = await createConfigurationProfile(envConfig.ApplicationId, 'config');

    if (!confProf || !confProf.Id) {
      return false;
    }
    envConfig.ConfigurationProfileId = confProf.Id;
    const deploymentStratRes = await getDeploymentStrategy();
    if (!deploymentStratRes || !deploymentStratRes.DeploymentStrategyId) {
      return false;
    }
    envConfig.DeploymentStrategyId = deploymentStratRes.DeploymentStrategyId;
    return envConfig;
  }

  private static async processInitData(envConfig: EnvConfig, options: Record<string, any>) {
    CenvLog.info(`${envConfig.ApplicationName}:${envConfig.EnvironmentName} - saving local files`);
    CenvFiles.SaveEnvConfig(envConfig);

    if (!options?.push && !options?.stack) {
      await CenvParams.pull(false, false, true, true);
    }

    if (options?.push) {
      await CenvParams.push(options?.materialize);
    }
  }

  public static async createParamsLibrary() {

    console.log('create params library')
    const cenvParamsPath = path.join(CenvFiles.ARTIFACTS_PATH, 'cenvParams');
    CenvFiles.freshPath(cenvParamsPath);
    const paramsPath = path.join(__dirname, '../params');
    cpSync(paramsPath, cenvParamsPath, { recursive: true, dereference: true });
    await execCmd('npm i', { path: cenvParamsPath });
    await execCmd('tsc', { path: cenvParamsPath });
    await execCmd(`zip -r materializationLambda.zip * > zip.log`, { path: cenvParamsPath });
    return path.join(cenvParamsPath, `materializationLambda.zip`);
    /*
        const libPathModule = cenvParamsPath + '/node_modules/@stoked-cenv/lib';
        CenvFiles.freshPath(libPathModule);

        const libPath = path.join(__dirname, '../');
        const pkg = '/package.json';
        const tsconfig = 'tsconfig.json';
        const index = '/index.ts';
        console.log(1, libPath, libPathModule);
        cpSync(path.join(libPath, 'src'), libPathModule, { recursive: true, dereference: true });
        console.log(2);
        cpSync(path.join(libPath,  'tsconfig.build.json' ), path.join(libPathModule, tsconfig), { recursive: true });
        const pkgMeta = require(libPath + 'package.json');
        writeFileSync(libPathModule + pkg, JSON.stringify(pkgMeta, null, 2));
        const paramsPath = path.join(__dirname, '../params');
        cpSync(paramsPath + pkg + '.build', cenvParamsPath + pkg, { recursive: true });
        cpSync(path.join(paramsPath, tsconfig + '.build'), path.join(cenvParamsPath, tsconfig), { recursive: true });
        cpSync(paramsPath + index + '.build', cenvParamsPath + index, { recursive: true });


        await execCmd('npm i', { path: libPathModule });
        await execCmd('npm i', { path: cenvParamsPath });
        const tmpParamsPath = path.join(cenvParamsPath, '../tmp');
        CenvFiles.freshPath(tmpParamsPath);
        await execCmd(`tsc --project tsconfig.build.json -outDir ${tmpParamsPath}`)
        console.log(2);
        cpSync(cenvParamsPath + '/lib', libPathModule, { recursive: true, dereference: true });
        await execCmd(`zip -r materializationLambda.zip * > zip.log`, { path: cenvParamsPath });
        return path.join(cenvParamsPath, `materializationLambda.zip`);

         */
    return "stuff";
  }

  private static initFlagValidation(options?: Record<string, any>): FlagValidation {
    if (options?.environment) {
      process.env.ENV = options.environment;
    }
    if (options?.stack && options?.push) {
      CenvLog.single.alertLog('The --push is redundant. It is implied when used with --deploy');
    } else if (options?.stack) {
      options.push = true;
    }

    const envConfig: EnvConfig = CenvFiles.GetConfig(options?.environment || process.env.ENV);

    if (!options?.destroy && !options?.clean && envConfig && envConfig?.ApplicationId && options?.application && envConfig.ApplicationName !== options.application) {
      CenvLog.single.errorLog('Must use --destroy or --clean with an existing config if --application is used');
      process.exit(0);
    }

    // exitWithoutTags(tags);
    return { application: options?.application, environment: options?.environment, options, envConfig };
  }
}

