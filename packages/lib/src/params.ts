import { deployConfig } from './aws/appConfig';
import {
  decryptValue,
  deleteParameters,
  getParameter, getParametersByPath, getVarsByType,
  isEncrypted,
  putParameter,
  updateTemplates
} from './aws/parameterStore';
import { invoke } from './aws/lambda';
import {
  infoAlertBold,
  infoBold,
  CenvLog, errorInfo, LogLevel,
} from './log';
import {
  envVarToKey,
  getParams,
  stripPath,
  upsertParameter,
} from './aws/parameterStore';
import chalk from "chalk";
import { getDeployedVars } from './aws/appConfigData';
import {ioReadVarList, readAsync} from './stdIo';
import {
  sleep, expandTemplateVars, getMonoRoot, packagePath,
} from './utils';
import { AppVarsFile, CenvFiles, EnvConfig, EnvVarsFile, GlobalEnvVarsFile, GlobalVarsFile } from './file';
import { existsSync, } from 'fs';
import { Package } from './package/package';
import { updateLambdas } from './aws/lambda';
import child_process from 'child_process';
import path from 'path';
import {Suite} from "./suite";
import {Environment} from "./environment";
import {ProcessMode} from "./package/module";

export const variableTypes = [ 'app', 'environment', 'global', 'globalEnv' ];

export function filteredCount(options: string[], types: string[]) {
  const filtered = options.filter(el => {
    return types.indexOf(el) > -1;
  });
  return filtered;
}

export function validateCount(options: string[], types: string[], silent = false) {
  const filtered = filteredCount(options, types);
  const valid = filtered.length === 1;
  if (!valid && !silent) {
    if (filtered.length === 0) {
      console.log(errorInfo('The command did not include parameter type.'));
    } else {
      console.log(errorInfo('The command included more than one type - included: ' + filtered.join(', ')));
    }
  }
  return valid ? filtered[0] : false;
}

export function validateOneType(options: string[]) {
  return validateCount(options, variableTypes);
}

export interface LambdaProcessResponse {
  before?: string,
  after?: string,
  error?: Error
}

export interface BaseCommandOptions {
  profile?: string;
  cli?: boolean;
  logLevel?: string;
  localPackageAccepted?: boolean;
  defaultSuite?: string;
  scopeName?: string;
  help?: boolean;
}

export interface DashboardCreateOptions {
  packages?: Package[],
  suite?: Suite,
  environment?: Environment
  options: any,
  cmd?: ProcessMode
}

export declare class Dashboard{}
export type DashboardCreator = (deployCreateOptions: DashboardCreateOptions) => Dashboard;

export class CenvParams {

  static async removeParameters(params: any, options: any, types: string[]) {
    const { cenvPackage, paramData, rootPaths, inCenvRoot } = await this.buildDataRemoveLinks(params, options, types);
    await CenvParams.removeParameter(params, options, paramData, rootPaths, inCenvRoot, cenvPackage);
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
          CenvLog.single.infoLog(`removed all ${infoBold(paths.length)} ${infoBold(varType)} parameters${' related to ' + pkg}`);
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

  static async buildDataRemoveLinks(params: any, options: any, types: string[]) {
    try {
      await sleep(3);

      if (params.length && options?.all) {
        CenvLog.single.errorLog('You must not specify variables to delete with the --all flag');
        process.exit(1);
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

      const paramData = [];
      const varTypes = inCenvRoot ? variableTypes : ['global', 'globalEnv'];
      const vars: any = {};
      const rootPaths: any = inCenvRoot ?
        CenvParams.GetRootPaths(config.ApplicationName, config.EnvironmentName) :
        {global: `/global/${process.env.ENV}`, globalEnv: `/globalenv/${process.env.ENV}`};

      if (options?.all) {
        await this.removeAll(varTypes, rootPaths, type, cenvPackage)
        CenvLog.single.catchLog(new Error('removeAll'));
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
                process.exit(1);
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
          if (inCenvRoot) {
            CenvLog.single.errorLog(`${param} does not exist in this package ${process.cwd()}`);
            process.exit(1);
          } else {
            CenvLog.single.errorLog(`${param} does not exist in the current env: ${process.env.ENV}`);
            process.exit(2);
          }
        }
      }
      return {cenvPackage, paramData, rootPaths, inCenvRoot};
    } catch(e) {
      CenvLog.single.catchLog(new Error('buildDataRemoveLinks'))
    }
  }


  static async removeParameter(params: any, options: any, paramData: any, rootPaths: any, inCenvRoot: boolean, cenvPackage: string) {
    const linksUpdated: any = [];
    const linksAttempted = []
    const paramsUpdated = [];

    if (options?.kill) {
      const killItWithFire = await readAsync('The --kill flag removes the global parameter entirely. Any services that depend on it will be broken. Are you sure you want to delete the global parameter? (y/n): ', 'n');
      if (killItWithFire !== 'y') {
        console.log(errorInfo('The global parameter was not deleted. If you simply want to remove the reference from this application to the global parameter use the same command without --kill.'));
        process.exit(1);
      }
    }

    for (let i = 0; i < paramData.length; i++) {
      const pdata = paramData[i];
      if (inCenvRoot && (pdata.type === 'global' || pdata.type === 'globalEnv')) {
        linksAttempted.push(params[i])
        const rootLink = rootPaths[pdata.type + 'Link'];
        const linkVars = await getParameter(rootLink, true);
        if (linkVars) {
          const newLinkVarPaths = [];
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
      CenvLog.single.infoLog(`deleted link(s): [${infoBold(linksUpdated.join(', '))}]`);
    }
    if (linksUpdated.length !== linksAttempted.length) {
      const remaining = linksAttempted.filter(p => !linksUpdated.includes(p));
      CenvLog.single.alertLog(`attempted to remove link(s) [${infoAlertBold(remaining.join(', '))}] from ${cenvPackage} but ${remaining.length > 1 ? 'they were' : 'it was'} not found`)
    }
    if (paramsUpdated.length > 0) {
      CenvLog.single.infoLog(`deleted: [${infoBold(paramsUpdated.join(', '))}]`);
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
    return { pkg };
  }

  public static GetRootPath(ApplicationName: string, EnvironmentName: string, type: string) {
    const paths: any = this.GetRootPaths(ApplicationName, EnvironmentName);
    return paths[type];
  }

  public static GetRootPaths(ApplicationName: string, EnvironmentName: string) : {
    app: string,
    globalLink: string,
    global: string,
    globalEnvLink: string,
    globalEnv: string,
    environment: string,
    generate: string
  } {
    const app =   stripPath(ApplicationName);
    const env = stripPath(EnvironmentName);
    return {
      app: stripPath(`/service/${app}/app`),
      globalLink: stripPath(`/service/${app}/global`),
      global: stripPath(`/global`),
      globalEnvLink: stripPath( `/service/${app}/globalenv/${env}`),
      globalEnv: stripPath(`/globalenv/${env}`),
      environment: stripPath(`/service/${app}/environment/${env}`),
      generate: stripPath(`/service/${app}/generate`)
    };
  }

  private static async pushType(vars: any, type: string, config: any, updatedCount: number) {
    if ( vars[type] ) {
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

  static async push(materialize: boolean, decrypted = false): Promise<void> {
    const config = CenvFiles.GetConfig();
    if (!config) {
      CenvLog.single.errorLog('no local variables found to push');
      return;
    }

    CenvLog.single.infoLog(`pushing ${infoBold(config.EnvironmentName)} variables to cloud`);

    let updatedCount = 0;
    const data = await CenvFiles.GetVars(true, decrypted);
    updatedCount = await this.pushType(data, 'app', config, updatedCount);
    updatedCount = await this.pushType(data, 'environment', config, updatedCount);
    updatedCount = await this.pushType(data, 'global', config, updatedCount);
    updatedCount = await this.pushType(data, 'globalEnv', config, updatedCount);

    let parametersVerified = false;
    const condensed =  {...data.app, ...data.environment, ...data.global, ...data.globalEnv};
    let count = 2;
    while (!parametersVerified || count === 0) {
      const params = await getParams(config, 'all', 'simple', true, false, true)
      let matching = true;
      const unmatched: any = { existing: { }, updated: {}};
      for (let i = 0; i < Object.keys(params).length; i++) {
        const key = Object.keys(params)[i];
        const param = params[key];
        let compare = condensed[key];
        if (isEncrypted(condensed[key] as string)) {
          const decrypted = await decryptValue(condensed[key])
          console.log('decrypted', decrypted);
          compare = decrypted;
        }
        if(param !== compare) {
          unmatched.existing[key] = param;
          unmatched.updated[key] = compare
          matching = false;
        }
      }
      parametersVerified = matching;
      if (!parametersVerified) {
        await sleep(10);
        CenvLog.single.alertLog('sleeping for 5 seconds to wait for consistency in parameter store before materialization', Package.packageNameToStackName(config.ApplicationName));
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
      console.log(chalk.green(`updated ${updatedCount} parameters`));
    }

    if (materialize) {
      await this.Materialize();
    }
  }

  static async mergeDataType(file: any, vars: any, type: string) {

    let fileData = null;
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
          fileData['ENVIRONMENT_NAME'] = process.env.ENV;
        }
      }
    }

    if (!fileData) {
      return { vars, changed: false };
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
    vars = {...vars, ...fileData };
    return { vars, changed };
  }

  static async pull(materialized = false, decrypted = false, silent = false, init = false, push = true, save = true, config: EnvConfig = undefined, allValues = false) {
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

      variables = await getDeployedVars(options, undefined, silent);
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

      if (mergeAppDataRes.changed || mergeEnvDataRes.changed || mergeGlobalEnvDataRes.changed || mergeGlobalDataRes.changed) {
        if (save) {
          CenvFiles.SaveVars(variables, data.EnvironmentName, false);
        }
        if (push) {
          await this.push(true, false);
        }
      }
    } else if (Object.keys(variables).length > 0) {
      if (save) {
        CenvFiles.SaveVars(variables, data.EnvironmentName, false);
      }
    } else {
      CenvLog.single.alertLog(`no variables configured for the ${infoAlertBold(data.EnvironmentName)} environment`)
    }
    return variables;
  }

  public static async Materialize(test = false) {
    const data: any = CenvFiles.GetConfig();
    if (!data) {
      return;
    }
    if (process.env.ENV === 'local') {
      data.isLocalStack = true;
    }
    if (test) {
      const res = await this.MaterializeCore(data);
      CenvLog.single.verboseLog('materialization test results:\n' + res);
    } else {
      const { before, after, error } = await invoke('cenv-params', JSON.stringify(data))
      if (error) {
        CenvLog.single.errorLog(JSON.stringify(error, null, 2));
        return;
      }

      if (before) {
        let output = '';
        for (const [beforeKey, beforeValue] of Object.entries(before) as [string, string][]) {
          for (const [afterKey, afterValue] of Object.entries(after) as [string, string][]) {
            if (afterKey === beforeKey) {
              output += `'${infoBold(afterKey)}': '${infoBold(afterValue)}' ${(process.env.CENV_LOG_LEVEL === 'VERBOSE' && beforeValue !== afterValue) ? `- ${chalk.green(beforeValue)}` : ''}\n`;
            }
          }
        }
        CenvLog.single.verboseLog('materialization results:\n' + output, data.ApplicationName);
      }
    }
  }

  public static async MaterializeCore(event: any = undefined): Promise<LambdaProcessResponse> {
    try {
      const {
        ApplicationId,
        EnvironmentId,
        ConfigurationProfileId,
        ApplicationName,
        EnvironmentName,
        DeploymentStrategyId
      } = event;

      if (!ApplicationName || !EnvironmentName || !ApplicationId || !EnvironmentId || !ConfigurationProfileId || !DeploymentStrategyId) {
        console.log('Missing required parameters in event');
        return {error: new Error('Missing required parameters in event')}
      }

      if (event.isLocalStack) {
        console.log('set localstack')
        process.env.AWS_ENDPOINT = 'http://localhost.localstack.cloud:4566';
      }

      const appConfig = {
        ApplicationId,
        EnvironmentId,
        ConfigurationProfileId,
        ApplicationName,
        EnvironmentName,
        DeploymentStrategyId
      };
      // materialize the new app vars from the parameter store using the app config as input
      let materializedVars = await getParams(appConfig, 'all', 'simple', true, false, true);

      // expand template variables
      const before = JSON.parse(JSON.stringify(materializedVars));
      //let output = JSON.stringify(materializedVars, null, 2)
      materializedVars = expandTemplateVars(materializedVars);

      const after = materializedVars;

      // deploy the materialized vars to a new config profile version
      await deployConfig(materializedVars, appConfig);
      await updateLambdas(materializedVars, `${EnvironmentName}-${ApplicationName.replace(Package.scopeName, '')}`);
      return { before, after }
    } catch(e) {
      CenvLog.single.errorLog('Cenv.MaterializeCore err: ' + (e.stack ? e.stack : e))
      return { error: e };
    }
  }
}

