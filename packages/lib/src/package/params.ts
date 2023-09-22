import { PackageModule, PackageModuleType } from './module';
import {
  AppVars,
  AppVarsFile,
  CenvFiles,
  CenvVars,
  EnvConfig,
  EnvConfigFile,
  EnvVarsFile,
  GlobalEnvVarsFile,
  GlobalVarsFile,
  IEnvConfig,
  IParameter,
  VarList,
} from '../file';

import * as path from 'path';
import { join } from 'path';
import { existsSync, readFileSync, rmSync } from 'fs';
import { createAppEnvConf, destroyAppConfig, destroyRemainingConfigs, getConfig, getEnvironment, getEnvironmentAppConfigs } from '../aws/appConfig';
import { CenvParams, validateOneType, variableTypes } from '../params';
import { CenvLog, LogLevel } from '../log';
import { expandTemplateVars, simplify, sleep } from '../utils';
import {
  appendParameter, decryptValue,
  deleteParameters,
  deleteParametersByPath,
  envVarToKey,
  getParameter,
  getParametersByPath,
  getVarsByType,
  isEncrypted,
  listParameters,
  putParameter,
  stripPath,
  updateTemplates,
  upsertParameter,
} from '../aws/parameterStore';
import { Semaphore } from 'async-mutex';
import { getConfigVars } from '../aws/appConfigData';
import {Package, PackageCmd, TPackageMeta} from './package';
import { deepDiffMapper, DiffMapperType, valueWrapper } from '../types/Object';
import { invoke } from '../aws/lambda';
import { ioReadVarList, readAsync } from '../stdio';
import { Cenv, ParamsCommandOptions } from '../cenv';
import { encrypt } from '../aws/kms';

//

export class CenvVarsCount {
  app = 0;
  environment = 0;
  globalEnv = 0;
  global = 0;
}

interface FlagValidation {
  application: string;
  environment: string;
  options: any;
  envConfig: EnvConfig;
}

export class ParamsModule extends PackageModule {
  static semaphore = new Semaphore(2);
  static showDuplicateParams = false;
  config: IEnvConfig;
  pushedVarsTyped?: CenvVars;
  pushedVarsExpanded: VarList = {};
  pushedVars?: VarList;
  localVars?: VarList;
  localVarsTyped = new CenvVars();
  localVarsExpanded: VarList = {};
  materializedVars: VarList = {};
  materializedVarsTyped?: CenvVars;
  materializedDeploymentNumber?: number;
  hasCenvVars = false;
  hasLocalConfig = false;
  varsUpToDateFlag = false;
  processStatus = '[PARAMS] needs update: vars not deployed';
  materializationStatus = '[PARAMS] needs update: vars not materialized';
  // not found in parameter store and has not been materialized
  localOnlyVars: string[] = [];
  // found locally and in parameter store but has not been materialized
  notFoundInMaterializationVars: string[] = [];
  // ony found in parameter store.. not locally and not materialized
  deployedOnlyVars: string[] = [];
  // existing in parameter store and is materialized but doesn't exist locally
  localNotFoundVars: string[] = [];
  // any var that does not have the exact same value locally, in parameters store, and in the latest materialized config
  unmatchedVarValues: string[] = [];
  // vars that are deployed but their values don't match the ones that are materialized
  unmatchedMaterializedVars: string[] = [];
  // local vars that have values different than the deployed values
  unmatchedDeployedVars: string[] = [];
  needsDeploy = false;
  needsMaterialization = false;
  unmatchedValues = false;
  localCounts = new CenvVarsCount();
  pushedCounts = new CenvVarsCount();
  materializedTotal = 0;
  pushedTotal = 0;
  localTotal = 0;
  totalsMatch = false;
  appValid = false;
  envValid = false;
  geValid = false;
  gValid = false;
  varsLoaded = false;
  cenvVars: any = {};
  duplicates: { key: string; types: string[] }[] = [];
  configPath: string;
  varsPath: string;

  constructor(pkg: Package, path: string, meta: TPackageMeta) {
    super(pkg, path, meta, PackageModuleType.PARAMS);
    this.config = new EnvConfig({ ApplicationName: pkg.packageName, EnvironmentName: CenvFiles.ENVIRONMENT });
    this.varsPath = join(this.path, CenvFiles.PATH, AppVarsFile.NAME);
    this.hasCenvVars = existsSync(this.varsPath);
    this.configPath = join(this.path, CenvFiles.PATH, EnvConfigFile.NAME);
    this.hasLocalConfig = existsSync(this.configPath);
    if (this.hasLocalConfig) {
      if (process.cwd() !== this.path) {
        process.chdir(this.path);
      }
    }
  }

  static async upsertComponentRef(pkg: Package) {
    const componentRef = this.getComponentRef(pkg);

    const link = await getParameter(componentRef.path, true)
    if (!link) {
      await putParameter(componentRef.path, componentRef.key, false, 'StringList');
      return `created component ref ${CenvLog.colors.infoBold(componentRef.path)} with value ${CenvLog.colors.infoBold(componentRef.key)}`;
    } else {
      const linkNode = link[componentRef.path];
      if (linkNode && linkNode.Value.indexOf(componentRef.key) === -1) {
        await appendParameter(componentRef.path, `,${componentRef.key}`);
        return `appended component ref ${CenvLog.colors.infoBold(componentRef.path)} with value ${CenvLog.colors.infoBold(componentRef.key)}`;
      }
    }
    return false;
  }

  static async removeComponentRef(pkg: Package) {
    const componentRef = this.getComponentRef(pkg);
    const refParams = await getParameter(componentRef.path, true)
    if (!refParams) {
      return;
    }
    const refParam = refParams[componentRef.path];
    if (refParam.Value.indexOf(process.env.APP!) !== -1) {
      const refs = refParam.Value.split(',');
      if (refs.length > 1) {
        const newRefs = refs.filter(r => r !== process.env.APP);
        await putParameter(componentRef.path, newRefs.join(','), true, 'StringList');
      } else {
        await deleteParameters([componentRef.path]);
      }
    }
    return false;
  }

  get anythingDeployed(): boolean {
    return (this.hasCenvVars && (this.varsUpToDateFlag || !!this.materializedDeploymentNumber || (!!this.pushedVars && Object.keys(this.pushedVars).length > 0) || (this.materializedVars && Object.keys(this.materializedVars).length > 0)));
  }

  public get varsCanDeploy() {
    return (this.config?.ApplicationId !== undefined && this.config?.EnvironmentId !== undefined && this.config?.ConfigurationProfileId !== undefined);
  }

  get moduleStrings(): string[] {
    let items = super.moduleBaseStrings;
    if (this.duplicates.length && ParamsModule.showDuplicateParams) {
      items = items.concat(this.printAllDuplicates().map((d) => CenvLog.colors.error(d)));
    }

    if (!this.pushedCounts) {
      return items;
    }

    const getColor = (valid: boolean) => valid ? CenvLog.colors.std : CenvLog.colors.error;
    const getColorBold = (valid: boolean) => valid ? CenvLog.colors.stdBold : CenvLog.colors.errorBold;

    const appColor = getColor(this.appValid);
    const appBold = getColorBold(this.appValid);
    const envColor = getColor(this.envValid);
    const envBold = getColorBold(this.envValid);
    const geColor = getColor(this.geValid);
    const geBold = getColorBold(this.geValid);
    const gColor = getColor(this.gValid);
    const gBold = getColorBold(this.gValid);
    const tColor = getColor(this.totalsMatch);
    const tBold = getColorBold(this.totalsMatch);

    if (this.pushedCounts) {
      items.push(appColor(`[${appBold('app')}] local: ${appBold(this.localCounts?.app)}, pushed: ${appBold(this.pushedCounts?.app)}`));
      items.push(envColor(`[${envBold('environment')}] local: ${envBold(this.localCounts?.environment)}, pushed: ${envBold(this.pushedCounts?.environment)}`));
      items.push(geColor(`[${geBold('globalEnv')}] local: ${geBold(this.localCounts?.globalEnv)}, pushed: ${geBold(this.pushedCounts?.globalEnv)}`));
      items.push(gColor(`[${gBold('global')}] local: ${gBold(this.localCounts?.global)}, pushed: ${gBold(this.pushedCounts?.global)}`));
      items.push(tColor(`totals - local: ${tBold(this.localTotal)} pushed: ${tBold(this.pushedTotal)} materialized: ${tBold(this.materializedTotal)}`));
    }

    return items;
  }

  get materializedTotalExpected(): number {

    if (this.duplicates?.length) {
      return this.materializedTotal + this.duplicates.map(d => d.types.length - 1).reduce((p, c) => p + c);
    } else {
      return this.materializedTotal;
    }
  }

  static async getApplications(deployOptions: any, application: string) {
    let applications: string[] = [];
    if (application) {
      applications.push(application);
    } else if (deployOptions?.applications) {
      applications = deployOptions?.applications;
    }
    return applications;
  }

  static async destroyGlobal() {
    await deleteParametersByPath('/global', ' -', 'destroy global');
    await deleteParametersByPath('/globalenv', ' -', 'destroy globalEnv');
  }

  static async destroyNonGlobal() {
    await deleteParametersByPath('/service', ' -', 'destroy service params');
  }

  static async destroyAllParams() {
    await this.destroyGlobal();
    await this.destroyNonGlobal();
  }

  static async destroyAllConfigs() {
    await destroyRemainingConfigs();
  }

  static fromModule(module: PackageModule) {
    return new ParamsModule(module.pkg, module.path, module.meta);
  }

  static async getParams(packageName: string, type = 'all', format: string, decrypted = false, materialized = false, silent = false) {
    const printPkg = format.endsWith('-pkg') ? packageName : undefined;
    format = format.replace('-pkg', '');

    let parameters: any = {};
    if (!materialized) {
      parameters = await listParameters(packageName, decrypted);
    } else {
      parameters = await getConfigVars(packageName, true);
    }
    let output = {};
    if (materialized) {
      type = 'materialized';
      output = parameters;
    }
    let noTypeSet = false;
    if (type === 'all') {
      output = { ...parameters.app, ...parameters.environment, ...parameters.global, ...parameters.globalEnv };
    } else if (type === 'allTyped') {
      if (parameters) {
        if (!silent) {
          ParamsModule.printYamlPretty(output, format, printPkg);
        }
        return CenvParams.AllTyped(parameters);
      }
    } else if (type === 'app' || type === 'environment' || type === 'global' || type === 'globalEnv') {
      output = parameters[type] ? parameters[type] : parameters;
    } else {
      noTypeSet = true;
    }

    let result = noTypeSet ? { ...parameters.app, ...parameters.environment, ...parameters.global, ...parameters.globalEnv } : output;
    if (format === 'simple') {
      result = simplify(result, printPkg);
    }
    if (!silent) {
      ParamsModule.printYamlPretty(result, format, printPkg);
    }

    return result;
  }

  static printPkgName(printPkg: string) {
    if (printPkg) {
      console.log(CenvLog.colors.successBold(printPkg));
    }
  }

  static printJsonPretty(jsonData: object, format: string, printPkg?: string) {
    const space = printPkg ? '  ' : '';
    if (printPkg) {
      this.printPkgName(printPkg);
    }
    for (const [key, value] of Object.entries(jsonData)) {
      const val: any = value;
      if (format === 'simple') {
        const keyVal = val.Value ? val.Value : val;
        console.log(`${space}${CenvLog.colors.infoBold(key)}: ${keyVal}`);
      } else {
        console.log(`${space}${CenvLog.colors.infoBold(key)}: `);
        console.log(`${space}  ${CenvLog.colors.infoBold('Value')}: ${val.Value}`);
        console.log(`${space}  ${CenvLog.colors.infoBold('Path')}: ${val.Path}`);
        console.log(`${space}  ${CenvLog.colors.infoBold('Type')}: ${val.Type}`);
      }
    }
    if (printPkg) {
      console.log('');
    }
  }

  static printYamlPretty(yamlData: any, format: string, printPkg?: string) {
    const space = printPkg ? '  ' : '';
    if (printPkg) {
      this.printPkgName(printPkg);
    }
    for (const [key, value] of Object.entries(yamlData)) {
      const val: any = value;
      if (format === 'simple') {
        const keyVal = val.Value ? val.Value : val;
        console.log(`${space}${CenvLog.colors.infoBold(key)}: ${keyVal}`);
      } else {
        console.log(`${space}${CenvLog.colors.infoBold(key)}: `);
        console.log(`${space}  ${CenvLog.colors.infoBold('Value')}: ${val.Value}`);
        console.log(`${space}  ${CenvLog.colors.infoBold('Path')}: ${val.Path}`);
        console.log(`${space}  ${CenvLog.colors.infoBold('Type')}: ${val.Type}`);
      }
    }
    if (printPkg) {
      console.log('');
    }
  }

  public static async GetConfig(applicationName: string, environment: string = CenvFiles.ENVIRONMENT) {
    if (!CenvFiles.EnvConfig || applicationName !== CenvFiles.EnvConfig.ApplicationName || environment !== CenvFiles.EnvConfig.EnvironmentName) {
      const conf = await getConfig(applicationName, environment);
      if (!conf) {
        CenvLog.single.catchLog(`no config found for ${applicationName} ${environment}`);
        process.exit(226);
      }
      return conf;
    }

    return CenvFiles.EnvConfig;
  }

  async destroy(parameterStore = true, appConfig = true) {
    this.pkg.setActiveModule(this.type);
    if (parameterStore) {
      await deleteParametersByPath(`/service/${stripPath(this.pkg.packageName)}`, '    -', this.pkg.packageName);
    }
    if (appConfig) {
      await destroyAppConfig(this.pkg.packageName, false);
    }
  }

  async loadLocal() {
    //this.pkg.stdPlain('loading local vars:', this.pkg.packageName);
    const localData = await CenvFiles.GetData(this.pkg.packageName);
    console.log('localData', JSON.stringify(localData, null, 2));
    this.localVarsTyped = localData?.Vars;
    this.localVars = this.convertToCenvVars(this.localVarsTyped);
    if (this.localVars && Object.keys(this.localVars).length > 0) {
      console.log('this.localVars', JSON.stringify(this.localVars, null, 2))
      this.localVarsExpanded = expandTemplateVars({...this.localVars});
    }
  }

  async loadDeployed() {
    //this.pkg.stdPlain('loading deployed vars:', this.pkg.packageName);
    this.pushedVarsTyped = await this.pull(false, false, true, false, false, false, this.config);
    this.pushedVars = this.convertToCenvVars(this.pushedVarsTyped);
    this.pushedVarsExpanded = expandTemplateVars(this.pushedVars);
  }

  async loadMaterialized() {
    const config = await getConfig(this.pkg.packageName);
    if (config && config.DeploymentNumber) {
      // get deployed vars
      //this.pkg.stdPlain('loading materialized vars:', this.pkg.packageName);
      this.materializedVarsTyped = await getConfigVars(this.pkg.packageName, true, true, false, true);
      this.materializedVars = this.convertToCenvVars(this.materializedVarsTyped);
    }
  }
  async loadVars(force = false, stage: undefined | string = undefined) {//options: {force: boolean, silent: boolean, stage?:
    console.log('force', force, 'stage', stage, 'this.varsLoaded', this.varsLoaded);
    // string} =
    // {force:
    try {
      // switch dir
      if (!this.varsLoaded || force) {
        const toDirVars = path.relative(process.cwd(), this.path);
        if (toDirVars !== '') {
          process.chdir(toDirVars);
        }
        if (!stage || stage === 'local') {
          await this.loadLocal();
        }
        if (!stage || stage === 'deployed') {
          await this.loadDeployed();
        }
        if (!stage || stage === 'materialized') {
         await this.loadMaterialized();
        }
      }
    } catch (e) {
      CenvLog.single.catchLog(e);
      process.exit(229);
    }
    this.varsLoaded = true;
  }

  public async materialize(test = false) {

    // switch dir
    if (process.cwd() !== this.path) {
      const toDirVars = path.relative(process.cwd(), this.path);
      process.chdir(toDirVars);
    }

    const data: any = await ParamsModule.GetConfig(this.pkg.packageName);
    if (!data) {
      return;
    }

    if (test) {
      const res = await CenvParams.MaterializeCore(data);
      CenvLog.single.verboseLog('materialization test results:\n' + res);
    } else {
      const { before, after, error } = await invoke('cenv-params', JSON.stringify(data));
      if (error) {
        CenvLog.single.errorLog(JSON.stringify(error, null, 2));
        return;
      }

      if (before) {
        let output = '';
        for (const [beforeKey, beforeValue] of Object.entries(before) as [string, string][]) {
          for (const [afterKey, afterValue] of Object.entries(after) as [string, string][]) {
            if (afterKey === beforeKey) {
              output += `'${CenvLog.colors.infoBold(afterKey)}': '${CenvLog.colors.infoBold(afterValue)}' ${(process.env.CENV_LOG_LEVEL === 'VERBOSE' && beforeValue !== afterValue) ? `- ${CenvLog.colors.success(beforeValue)}` : ''}\n`;
            }
          }
        }
        CenvLog.single.infoLog('materialization results:\n' + output, this.pkg.stackName);
      }
    }
  }

  async addParam(pkg: Package, params: string[], options: Record<string, any>) {
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
    if (!this.chDir()) {
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

    const parameter = await this.createParameter(key, value, type, options.decrypted);
    const res = await upsertParameter(pkg.packageName, parameter, type);
    await new Promise((r) => setTimeout(r, 2000));
    if (res !== 'SKIPPED') {
      await new Promise((r) => setTimeout(r, 2000));
      await this.pull(false, false, false);
    }
    if (options?.stack) {
      cmd.out(`deploying ${CenvLog.colors.infoBold(config.ApplicationName)} configuration to environment ${CenvLog.colors.smoothHighlight(config.EnvironmentName)}`);
      await this.materialize();
    }
    cmd.out('success');
    cmd.result(0);
    return cmd;
  }

  async removeParameters(params: any, options: any, types: string[], exitOnFail = true) {
    const resLinks = await this.buildDataRemoveLinks(params, options, types, exitOnFail);
    if (resLinks) {
      await this.removeParameter(params, options, resLinks.paramData, resLinks.rootPaths, resLinks.inCenvRoot, resLinks.packageName);
    }
  }

  async removeParameter(params: string[], options: any, paramData: any, rootPaths: any, inCenvRoot: boolean, cenvPackage: string) {
    const linksUpdated: string[] = [];
    const linksAttempted: string[] = [];
    const paramsUpdated: string[] = [];

    if (options?.kill && !options?.force) {
      const killItWithFire = await readAsync('The --kill flag removes the global parameter entirely. Any services that depend on it will be broken. Are you sure you want to delete the global parameter? (y/n): ', 'n');
      if (killItWithFire !== 'y') {
        console.log(CenvLog.colors.error('The global parameter was not deleted. If you simply want to remove the reference from this application to the global parameter use the same command without --kill.'));
        process.exit(6);
      }
    }

    for (let i = 0; i < paramData.length; i++) {
      const pdata = paramData[i];
      if (inCenvRoot && (pdata.type === 'global' || pdata.type === 'globalEnv')) {
        linksAttempted.push(params[i]);
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
              linksUpdated.push(params[i]);
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
          await deleteParameters([`${rootPaths[pdata.type]}/${envVarToKey(params[i])}`]);
          paramsUpdated.push(params[i]);
        }
      } else {
        await deleteParameters([`${rootPaths[pdata.type]}/${envVarToKey(params[i])}`]);
        paramsUpdated.push(params[i]);
      }
      updateTemplates(false, params[i], pdata.type);
    }
    if (linksUpdated.length > 0) {
      CenvLog.single.infoLog(`deleted link(s): [${CenvLog.colors.infoBold(linksUpdated.join(', '))}]`);
    }
    if (linksUpdated.length !== linksAttempted.length) {
      const remaining = linksAttempted.filter(p => !linksUpdated.includes(p));
      CenvLog.single.alertLog(`attempted to remove link(s) [${CenvLog.colors.alertBold(remaining.join(', '))}] from ${cenvPackage} but ${remaining.length > 1 ? 'they were' : 'it was'} not found`);
    }
    if (paramsUpdated.length > 0) {
      CenvLog.single.infoLog(`deleted: [${CenvLog.colors.infoBold(paramsUpdated.join(', '))}]`);
    }
    if (!options?.kill) {
      if (paramsUpdated.length || linksUpdated.length) {
        await this.pull(false, false, true);
      }
    }
  }

  async removeAll(varTypes: any, rootPaths: string[], type: string, pkg: Package) {
    let totalRemoved = 0;
    for (let j = 0; j < varTypes.length; j++) {
      await sleep(4);
      const varType = varTypes[j];
      const typed = type === varType;
      if (typed || !type) {
        const typedVars = await getVarsByType(varType, rootPaths[varType], false);
        const values = Object.values(typedVars);
        const paths = values.map((v: any) => v.Path);
        if (paths.length) {
          await deleteParameters(paths);
          totalRemoved += paths.length;
          CenvLog.single.infoLog(`removed all ${CenvLog.colors.infoBold(paths.length)} ${CenvLog.colors.infoBold(varType)} parameters${' related to ' + pkg}`);
        } else if (type) {
          CenvLog.single.alertLog(`attempted to remove all the ${type} parameters but none were found`);
        }
        if (typed) {
          process.exit();
        }
      }

    }
    if (!totalRemoved) {
      CenvLog.single.alertLog(`attempted to remove all the parameters but none were found`);
    }
  }

  async buildDataRemoveLinks(params: any, options: any, types: string[], exitOnFail = true) {
    try {
      if (params.length && options?.all) {
        CenvLog.single.errorLog('You must not specify variables to delete with the --all flag');
        process.exit(2);
      }

      const type = types[0];
      const paramData: { type: string, root: string, key: string, path: string, envVar: any }[] = [];
      const varTypes = options.allTypes ? variableTypes : ['global', 'globalEnv'];
      const vars: any = {};
      const rootPaths: any = options.allTypes ? CenvParams.GetRootPaths(this.pkg.packageName, CenvFiles.ENVIRONMENT) : {
        global: `/global`, globalEnv: `/globalenv/${CenvFiles.ENVIRONMENT}`,
      };

      if (options?.all) {
        await this.removeAll(varTypes, rootPaths, type, this.pkg);
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
                type: varType, root: varTypeRoot, key: envVarToKey(param), path: typedParamKey, envVar: param,
              });

              if ((varType === 'globalEnv' || varType === 'global') && !options?.kill) {
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
            CenvLog.single.errorLog(`${param} does not exist in the current env: ${CenvFiles.ENVIRONMENT}`);
            process.exit(5);
          } else {
            CenvLog.single.errorLog(`${param} does not exist in this package ${process.cwd()}`);
          }
        }
      }
      return { packageName: this.pkg.packageName, paramData, rootPaths, inCenvRoot: options.allTypes };
    } catch (e) {
      CenvLog.single.catchLog(new Error('buildDataRemoveLinks'));
    }
    return false
  }

  async showParams(options?: ParamsCommandOptions) {
    const stage = options?.stage ? options?.stage : 'materialized';
    const diff = options?.diff ? options?.diff : false;
    const typed = options?.typed ? options?.typed : false;
    const exported = options?.export ? options?.export : false;

    await this.loadVars(false, !diff ? stage : undefined);
    let local = stage === 'local' || process.env.ENV === 'local';
    let deployed = stage === 'deployed';
    let materialized = stage === 'materialized';
    const all = stage === 'all';
    if (all) {
      local = deployed = materialized = true;
    }

    if (local && this.localVarsTyped) {
      if (CenvLog.logLevel !== LogLevel.MINIMAL) {
        CenvLog.single.stdLog(`${this.pkg.stackName} local:`, this.pkg.stackName);
      }
      CenvLog.single.stdLog(JSON.stringify(typed ? this.localVarsTyped : this.localVars, null, 2), this.pkg.stackName);
    }
    if (deployed && this.pushedVarsTyped) {
      if (CenvLog.logLevel !== LogLevel.MINIMAL) {
        CenvLog.single.stdLog(`${this.pkg.stackName} deployed:`, this.pkg.stackName);
      }
      CenvLog.single.stdLog(JSON.stringify(typed ? this.pushedVarsTyped : this.pushedVars, null, 2), this.pkg.stackName);
    }
    if (materialized && this.materializedVarsTyped) {
      if (CenvLog.logLevel !== LogLevel.MINIMAL) {
        CenvLog.single.stdLog(`${this.pkg.stackName} materialized:`, this.pkg.stackName);
      }
      CenvLog.single.stdLog(JSON.stringify(typed ? this.materializedVarsTyped : this.materializedVars, null, 2), this.pkg.stackName);
    }


    if (diff && (local || deployed)) {
      this.pkg.info('local -> deployed: delta');
      if (this.localVarsTyped && this.pushedVarsTyped) {
        const replacedPushed = JSON.parse(JSON.stringify(typed ? this.pushedVarsTyped : this.pushedVars, this.getReplacer(this.pushedVarsExpanded), 2));
        const replacedLocal = JSON.parse(JSON.stringify(typed ? this.localVarsTyped : this.localVars, this.getReplacer(this.localVarsExpanded), 2))

        CenvLog.single.stdLog(JSON.stringify(deepDiffMapper.map(this.pushedVarsTyped, this.localVarsTyped, [DiffMapperType.VALUE_DELETED, DiffMapperType.VALUE_UPDATED, DiffMapperType.VALUE_CREATED]), null, 2), this.pkg.stackName);
      } else if (!this.localVarsTyped && !this.pushedVarsTyped) {
        CenvLog.single.stdLog('no local or deployed params found', this.pkg.stackName);
      } else if (!this.localVarsTyped) {
        CenvLog.single.stdLog('no local params found', this.pkg.stackName);
      } else if (!this.pushedVarsTyped) {
        CenvLog.single.stdLog('no deployed params found', this.pkg.stackName);
      }
    }
    if (diff && (materialized || deployed)) {
      if (this.pushedVarsTyped && this.materializedVarsTyped) {
        const replacedPushed = JSON.parse(JSON.stringify(typed ? this.pushedVarsTyped : this.pushedVars, this.getReplacer(this.pushedVarsExpanded), 2));
        const materialized = typed ? this.materializedVarsTyped : this.materializedVars;
        const diff = deepDiffMapper.map(materialized, replacedPushed, [DiffMapperType.VALUE_DELETED, DiffMapperType.VALUE_UPDATED, DiffMapperType.VALUE_CREATED])
        if (diff) {
          this.pkg.info('deployed -> materialized: delta');
          CenvLog.single.alertLog(JSON.stringify(diff, null, 2), this.pkg.stackName);
        } else {
          CenvLog.single.stdLog('no diff found', this.pkg.stackName);
        }
      } else if (!this.materializedVarsTyped && !this.pushedVarsTyped) {
        CenvLog.single.stdLog('no deployed or materialized params found', this.pkg.stackName);
      } else if (!this.materializedVarsTyped) {
        CenvLog.single.stdLog('no materialized params found', this.pkg.stackName);
      } else if (!this.pushedVarsTyped) {
        CenvLog.single.stdLog('no deployed params found', this.pkg.stackName);
      }
    }
  }

  getReplacer = (obj: any) => {
    return (key: string, value: string) => {
      if (obj[key]) {
        return obj[key]
      }
      return value;
    }
  }

  async init(options: any) {
    // switch dir
    if (process.cwd() !== this.path) {
      const toDirVars = path.relative(process.cwd(), this.path);
      process.chdir(toDirVars);
    }

    // deploy paramter store vars to app config
    await this.initParams({ ...options, application: this.pkg.packageName, environment: CenvFiles.ENVIRONMENT });
  }

  async deploy(options: any) {
    this.pkg.setActiveModule(this.type);
    const [value, release] = await ParamsModule.semaphore.acquire();

     try {

       let deploy = false;
       if (!options?.init) {
         const config = await getConfig(this.pkg.packageName);
         if (config) {
           deploy = true;
           const cmd = this.pkg.createCmd(`cenv params deploy ${this.pkg.packageName} --materialize`);
           await this.push(this.pkg.packageName, true);
           cmd.result(0);
         } else {
           if (this.hasLocalConfig) {
             rmSync(this.configPath);
           }
         }
       }


       if (!deploy) {
         options.push = true;
         options.materialize = true;
         const cmd = this.pkg.createCmd(`cenv params deploy ${this.pkg.packageName} --init --materialize`);
         await this.init(options);
         cmd.result(0);
       } else if (options?.materialize){
         await this.loadVars(true)
         let materializeIt = !Object.keys(this.materializedVars)?.length;
         if (Object.keys(this.materializedVars).length) {
           const diff = deepDiffMapper.map(this.materializedVars, JSON.parse(JSON.stringify(this.pushedVars, this.getReplacer(this.pushedVarsExpanded), 2)), [DiffMapperType.VALUE_DELETED, DiffMapperType.VALUE_UPDATED, DiffMapperType.VALUE_CREATED]);
           materializeIt = !!diff;
         }

         if (materializeIt) {
           const cmd = this.pkg.createCmd(`cenv params materialize ${this.pkg.packageName}`);
           await this.materialize();
           cmd.result(0);

         }
       }

       await sleep(4);
       await this.loadVars(true);

     } catch (e) {
        throw e;
     } finally {
       release();
     }
  }

  async push(applicationName: string, materialize: boolean, decrypted = false): Promise<void> {
    this.info(`deploying ${CenvLog.colors.infoBold(CenvFiles.ENVIRONMENT)} variables to cloud`, this.pkg.packageName);
    let updatedCount = 0;
    this.chDir();
    const data = await CenvFiles.GetLocalVars(applicationName, true, decrypted);
    const deployedData = await this.pull(false, false, true, false, false, false, undefined, true);
    if (data.app === undefined) data.app = {};
    if (data.environment === undefined) data.environment = {};
    if (data.global === undefined) data.global = {};
    if (data.globalEnv === undefined) data.globalEnv = {};
    const diff = deepDiffMapper.map(deployedData, data, [DiffMapperType.VALUE_DELETED]);
    CenvLog.single.infoLog('push diff: ' + JSON.stringify(diff, null, 2), Package.packageNameToStackName(applicationName));
    if (diff && Object.keys(diff).length !== 0) {
      for (const type of Object.keys(diff)) {
        if (diff[type]) {
          for (const key of Object.keys(diff[type])) {
            await this.removeParameters([key], { kill: true, force: true, allTypes: true }, [type], true)
          }
        }
      }
    }

    updatedCount = await this.pushType(data, 'app', applicationName, updatedCount);
    updatedCount = await this.pushType(data, 'environment', applicationName, updatedCount);
    updatedCount = await this.pushType(data, 'globalEnv', applicationName, updatedCount);
    updatedCount = await this.pushType(data, 'global', applicationName, updatedCount);

    let parametersVerified = false;
    const condensed = { ...data.app, ...data.environment, ...data.globalEnv, ...data.global };
    let count = 2;
    while (!parametersVerified || count === 0) {
      const params = await ParamsModule.getParams(applicationName, 'all', 'simple', true, false, true);
      let matching = true;
      const unmatched: any = { existing: {}, updated: {} };
      for (let i = 0; i < Object.keys(params).length; i++) {
        const key = Object.keys(params)[i];
        const param = params[key];
        let compare = condensed[key];
        if (isEncrypted(condensed[key] as string)) {
          const decrypted = await decryptValue(condensed[key]);
          compare = decrypted;
        }
        if (param !== compare) {
          unmatched.existing[key] = param;
          unmatched.updated[key] = compare;
          matching = false;
        }
      }

      parametersVerified = matching;
      if (!parametersVerified) {
        await sleep(10);
        CenvLog.single.alertLog('sleeping for 5 seconds to wait for consistency in parameter store before materialization', Package.packageNameToStackName(applicationName));
        CenvLog.single.alertLog(JSON.stringify(unmatched, null, 4));
        count--;
      }
    }
    if (count === 0) {
      CenvLog.single.catchLog('the parameter store did not become consistent with the data that we pushed even after 2 tries.. deploy failed');
    }

    if (!updatedCount) {
      CenvLog.single.infoLog(`${CenvFiles.ENVIRONMENT} application configuration parameters are up to date`);
    } else {
      CenvLog.single.stdLog(CenvLog.colors.success(`updated ${updatedCount} parameters`));
    }

    if (materialize) {
      await this.materialize();
    }
  }

  async mergeDataType(file: any, vars: any, type: string) {

    let fileData: Record<string, string> = {};
    let changed = false;

    if (!process.env.CENV_PARAMS_EXTRACTION_TEST && existsSync(file.PATH)) {
      fileData = file.read(file.PATH, file.SCHEMA, true);
    }

    if (type === 'envTemplate' || type === 'globalEnvTemplate') {
      if (!fileData && existsSync(file.TEMPLATE_PATH)) {
        fileData = file.read(file.TEMPLATE_PATH, file.SCHEMA, true);
        if (!fileData) {
          return { vars, changed };
        }
        console.log('fileData', fileData);
        if (type === 'globalEnvTemplate') {
          delete fileData['ENVIRONMENT_NAME'];
        }
        if (!process.env.CENV_LOCAL && !process.env.CENV_DEFAULTS) {
          fileData = await ioReadVarList(fileData, true);
        }
        if (type === 'globalEnvTemplate') {
          fileData['ENVIRONMENT_NAME'] = CenvFiles.ENVIRONMENT;
        }
      }
    }

    if (!fileData) {
      return { vars, changed: false };
    }

    if (process.env.CENV_PARAMS_EXTRACTION_TEST) {
      const preTest = { ...fileData };
      CenvLog.single.infoLog(`${file.NAME} before template expansion:\n ${JSON.stringify(fileData, null, 2)}`);
      fileData = expandTemplateVars(fileData);
      CenvLog.single.infoLog(`${file.NAME} after template expansion:\n ${JSON.stringify(fileData, null, 2)}`);
      fileData = preTest;
    }

    if (JSON.stringify(fileData) != JSON.stringify(vars)) {
      changed = true;
    }
    vars = { ...vars, ...fileData };
    return { vars, changed };
  }

  async pull(materialized = false, decrypted = false, silent = false, init = false, push = true, save = true, config?: IEnvConfig, allValues = false) {

    let variables;
    if (!materialized) {
      variables = await ParamsModule.getParams(this.pkg.packageName, 'allTyped', 'simple', decrypted, materialized, silent);
    } else {
      variables = await getConfigVars(this.pkg.packageName, allValues, silent);
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

      const changed = mergeAppDataRes.changed || mergeEnvDataRes.changed || mergeGlobalEnvDataRes.changed || mergeGlobalDataRes.changed;
      if (save || changed) {
        CenvFiles.SaveVars(variables, CenvFiles.ENVIRONMENT, false);
      }
      if (push || changed) {
        await this.push(this.pkg.packageName, true, false);
      }
    } else if (Object.keys(variables).length > 0) {
      if (save) {
        CenvFiles.SaveVars(variables, CenvFiles.ENVIRONMENT, false);
      }
    } else {
      CenvLog.single.alertLog(`no variables configured for the ${CenvLog.colors.alertBold(CenvFiles.ENVIRONMENT)} environment`);
    }
    return variables;
  }

  async checkVarsUpToDate(): Promise<boolean> {
    if (this.varsUpToDateFlag) {
      return this.varsUpToDateFlag;
    }
    try {
      let expandedMaterializedVars: any = {};
      if (this.materializedVars) {
        expandedMaterializedVars = expandTemplateVars(JSON.parse(JSON.stringify(this.materializedVars)));
      }
      let expandedPushedVars: any = {};
      if (this.pushedVars) {
        expandedPushedVars = expandTemplateVars(JSON.parse(JSON.stringify(this.pushedVars)));
      }
      const expandedLocalVars = expandTemplateVars(JSON.parse(JSON.stringify(this.localVars)));

      let match = true;

      for (const [key, value] of Object.entries(expandedLocalVars) as [string, string][]) {
        let val = value;
        if (isEncrypted(value)) {
          val = await decryptValue(value);
        }
        if (!expandedPushedVars[key] && !expandedMaterializedVars[key]) {
          this.needsDeploy = true;
          this.localOnlyVars.push(key);
        } else if (!expandedMaterializedVars[key]) {
          this.needsMaterialization = true;
          this.notFoundInMaterializationVars.push(key);
        }
        let valueMatch = true;
        let pushVal = expandedPushedVars[key];
        if (isEncrypted(expandedPushedVars[key])) {
          pushVal = await decryptValue(expandedPushedVars[key]);
        }
        if (pushVal !== val) {
          //this.pkg.info(`[${this.pkg.stackName}] local -> {${key}: ${val}} does not match pushed -> {${key}: ${pushVal}}`);
          this.needsDeploy = true;
          match = false;
          valueMatch = false;
          this.unmatchedDeployedVars.push(key);
        }
        if (expandedMaterializedVars[key] !== val) {
          //this.pkg.info(`[${this.pkg.stackName}] local -> {${key}: ${val}} does not match materialized -> {${key}: ${expandedMaterializedVars[key]}}`);
          this.needsMaterialization = true;
          match = false;
          valueMatch = false;
        }
        if (!valueMatch) {
          this.unmatchedVarValues.push(key);
        }
      }

      for (const [key, value] of Object.entries(expandedPushedVars) as [string, string][]) {
        let val = value;
        if (isEncrypted(value)) {
          val = await decryptValue(value);
        }
        if (!expandedLocalVars[key] && !expandedMaterializedVars[key]) {
          this.deployedOnlyVars.push(key);
        } else if (!expandedLocalVars[key]) {
          this.localNotFoundVars.push(key);
        }
        if (expandedMaterializedVars[key] !== val) {
          //this.pkg.info(`[${this.pkg.stackName}] pushed -> {${key}: ${val}} does not match materialized -> {${key}: ${expandedMaterializedVars[key]}}`);
          this.needsMaterialization = true;
          match = false;
          this.unmatchedMaterializedVars.push(key);
          if (this.unmatchedVarValues.indexOf(key) === -1) {
            this.unmatchedVarValues.push(key);
          }
        }
      }

      if (Object.keys(expandedPushedVars)?.length !== Object.keys(expandedLocalVars)?.length) {
        this.processStatus = this.statusLine('deployed vars not in sync', 'deployed var count doesn\'t match local', true);
      } else if (Object.keys(expandedMaterializedVars)?.length !== Object.keys(expandedPushedVars)?.length && !this.duplicates.length) {
        this.materializationStatus = this.statusLine(`materialized vars not in sync`, 'materialized var count doesn\'t match deployed', true);
      } else if (this.unmatchedDeployedVars?.length) {
        this.processStatus = this.statusLine(`orphaned deployed vars`, 'deployed var values don\'t match local or materialized vars', true);
      } else if (this.unmatchedMaterializedVars?.length) {
        this.materializationStatus = this.statusLine(`orphaned materialized vars`, 'materialized var values don\'t match local or pushed vars', true);
      }

      this.materializedTotal = this.materializedVars ? Object.keys(this.materializedVars).length : 0;
      this.pushedTotal = this.pushedCounts.app + this.pushedCounts.environment + this.pushedCounts.globalEnv + this.pushedCounts.global;
      this.localTotal = this.localCounts.app + this.localCounts.environment + this.localCounts.globalEnv + this.localCounts.global;
      this.totalsMatch = false;

      if (this.localTotal === this.pushedTotal && this.pushedTotal === this.materializedTotalExpected) {
        // good enough for government work
        this.totalsMatch = true;
      }

      this.appValid = this.totalsMatch && this.localCounts.app === this.pushedCounts.app;
      this.envValid = this.totalsMatch && this.localCounts.environment === this.pushedCounts.environment;
      this.geValid = this.totalsMatch && this.localCounts.globalEnv === this.pushedCounts.globalEnv;
      this.gValid = this.totalsMatch && this.localCounts.global === this.pushedCounts.global;

      this.varsUpToDateFlag = match && this.totalsMatch;

      return this.varsUpToDateFlag;
    } catch (err) {
      CenvLog.single.catchLog(err);
      process.exit(83);
    }
  }

  /*async deploy(options: any) {
    const [value, release] = await ParamsModule.semaphore.acquire();


    const commandEvents = {
      postCommandFunc: async () => {
        await this.loadVars();
        options.cenvVars = {...options.cenvVars, ...this.cenvVars}
      }
    }

    options.commandEvents = commandEvents;
    await this.pkg.pkgCmd(`cenv params ${this.pkg.packageName} init materialize`, options);

    // consider it a success if we have at least one parameter
    if (!options.cenvVars || !Object.keys(options.cenvVars).length) {
      throw new Error(`[${this.pkg.packageName}] deploy params - get params failure`)
    }

    release();
  }

   */

  varsUpToDate() {
    return !this.hasCenvVars || this.varsUpToDateFlag;
  }

  async fixDupes() {
    try {
      for (const key of Object.keys(this.localVarsTyped.globalEnv) as string[]) {
        if (this.localVarsTyped.app[key as keyof AppVars]) {
          this.pkg.alert(`${key} from app and keeping the version in globalEnv`, 'remove parameter');
          await this.removeParameters([key], {}, ['app'], false);
        }
        if (this.localVarsTyped.environment[key]) {
          this.pkg.alert(`${key} from environment and keeping the version in globalEnv`, 'remove parameter');
          await this.removeParameters([key], {}, ['environment'], false);
        }
      }
      for (const key of Object.keys(this.localVarsTyped.global) as string[]) {
        if (this.localVarsTyped.app[key]) {
          this.pkg.alert(`${key} from app and keep the version in global`, 'remove parameter');
          await this.removeParameters([key], {}, ['app'], false);
        }
        if (this.localVarsTyped.environment[key]) {
          this.pkg.alert(`${key} from environment and keep the version in global`, 'remove parameter');
          await this.removeParameters([key], {}, ['environment'], false);
        }
        if (this.localVarsTyped.globalEnv[key]) {
          this.pkg.alert(`${key} from globalEnv and keeping the version in global`, 'remove parameter');
          await this.removeParameters([key], {}, ['globalEnv'], false);
        }
      }
      await this.pull(false, false, true, false, true, true, undefined, false);
      await this.pkg.checkStatus();
    } catch (e) {
      CenvLog.single.errorLog('fix dupes' + e, this.pkg.stackName);
    }
  }

  getDetails() {
    if (this.duplicates.length && ParamsModule.showDuplicateParams) {
      this.status.needsFix.push(this.statusLineType('duplicates', `param(s) exist in more than one param type\n\t${this.printAllDuplicates().join('\n\t')}`, 'needsFix'));
    }

    if (this.varsUpToDate() && this.hasCenvVars) {
      this.status.deployed.push(this.statusLineType('up to date', 'local vars, pushed vars, and deployed vars are in sync', 'deployed'));
    } else {

      if (!this.config) {
        this.status.incomplete.push(this.statusLineType('needs deploy', 'no config or config invalid', 'incomplete'));
      } else if (!this.totalsMatch) {
        if (this.localTotal !== this.pushedTotal) {
          this.status.incomplete.push(this.statusLineType('pushed param count mismatch', `local param count: ${this.localTotal} pushed param count: ${this.pushedTotal}`, 'incomplete'));
        } else if (this.materializedTotal === 0) {
          this.status.incomplete.push(this.statusLineType('params not materialized', `none of the ${this.localTotal} params have been materialized`, 'incomplete'));
        } else if (this.materializedTotal !== this.materializedTotalExpected && !this.duplicates.length) {
          this.status.incomplete.push(this.statusLineType('materialized mismatch', `pushed count: ${this.pushedTotal} materialized count: ${this.materializedTotal}`, 'incomplete'));
        }
      }
    }
    if (this.needsDeploy) {
      this.status.incomplete.push(this.processStatus);
    }
  }

  printDuplicate(d: any) {
    return `param ${d.key}: exists in ${d.types.length} param types: [${d.types.join(', ')}]`;
  }

  printAllDuplicates() {
    return this.duplicates.map((d) => this.printDuplicate(d));
  }

  upToDate(): boolean {
    return this.varsUpToDate();
  }

  deployed(): boolean {
    return this.hasCenvVars && !this.needsDeploy && !this.needsMaterialization;
  }

  convertToCenvVars(vars: any): VarList {
    if (!vars) {
      return {};
    }
    delete vars.environmentTemplate;
    delete vars.globalEnvironmentTemplate;
    if (vars.app) {
      delete vars.app.global;
      delete vars.app.globalEnv;
      //delete vars.environmentTemplate;
      //delete vars.globalEnvironmentTemplate;
    }
    vars = simplify(vars);
    return {
      ...vars.app, ...vars.environment, ...vars.global, ...vars.globalEnv,
    };
  }

  reset() {
    this.checked = false;
    this.varsLoaded = false;
    this.varsUpToDateFlag = false;
    this.localVarsTyped = new CenvVars();
    this.localVars = undefined;
    this.pushedVars = undefined;
    this.pushedVarsTyped = undefined;
    this.materializedVars = {};
    this.localCounts = new CenvVarsCount();
    this.pushedCounts = new CenvVarsCount();
    this.localOnlyVars = [];
    this.notFoundInMaterializationVars = [];
    this.deployedOnlyVars = [];
    this.localNotFoundVars = [];
    this.unmatchedVarValues = [];
    this.unmatchedMaterializedVars = [];
    this.unmatchedDeployedVars = [];
    this.materializedTotal = 0;
    this.duplicates = [];
    this.materializedDeploymentNumber = undefined;
    this.config = new EnvConfig({ ApplicationName: this.pkg.packageName, EnvironmentName: CenvFiles.ENVIRONMENT });
    this.status = { needsFix: [], deployed: [], incomplete: [] };
  }

  statusIssues() {
    const paramsUpToDate = !this?.hasCenvVars || this?.varsUpToDateFlag;
    this.verbose(`hasCenvVars: [${this?.hasCenvVars}] varsUpToDateFlag: [${this?.varsUpToDateFlag}] paramsUpToDate: ${paramsUpToDate}`, 'params status debug');
  }

  printCheckStatusComplete(silent = false): void {
    
    const status: any = {
      file: path.resolve(EnvConfigFile.PATH),
      stage: {
        local: 0,
        deployed: 0,
        materialized: 0
      }
    };
    if (this.localVars) {
      status.stage.local = Object.keys(this.localVars).length;
    }
    if (this.pushedVars) {
      status.stage.deployed = Object.keys(this.pushedVars).length;
    }
    if (this.materializedVars) {
      if (!silent) {
        this.info(JSON.stringify(this.materializedVars, null, 2), 'materialized vars');
      }
      status.stage.materialized = Object.keys(this.materializedVars).length;
    }
    if (!silent) {
      this.info(JSON.stringify(status, null, 2), 'stage count');
    }
    this.checked = true;
    this.getDetails();
  }

  chDir() {
    if (process.cwd() !== this.path) {
      this.verbose(this.path, 'pkg module cwd');
      process.chdir(path.relative(process.cwd(), this.path));
    }
    return true;
  }

  async checkStatus(silent = false) {
    try {
      if (!this.pkg) {
        return;
      }
      this.printCheckStatusStart();
      this.chDir();
      const config = await getConfig(this.name);
      if (config) {
        this.config = config;
        this.materializedDeploymentNumber = this.config.DeploymentNumber;
      }

      await this.loadVars();
      this.localCounts = this.getVarCounts(this.localVarsTyped);
      this.checkForDuplicates();
      this.pushedCounts = this.getVarCounts(this.pushedVarsTyped);
      this.pushedVars = this.convertToCenvVars(this.pushedVarsTyped);
      await this.checkVarsUpToDate();

      this.printCheckStatusComplete(silent);
    } catch (e) {
      CenvLog.single.catchLog(e);
      process.exit(325);
    }
  }

  pushDuplicate(key: string, section: string, dupeSection: any) {
    const exists = this.duplicates.find(d => d.key === key);
    if (exists) {
      exists.types.push(dupeSection);
      exists.types = [...new Set(exists.types)];
    } else {
      this.duplicates.push({ key, types: [section, dupeSection] });
    }
  }

  checkForDuplicates() {
    if (this.localVarsTyped.app) {
      const l = this.localVarsTyped;
      Object.keys(l.app).forEach((v, i) => {
        const section = 'app';
        if (l?.environment && l?.environment[v]) {
          this.pushDuplicate(v, section, 'environment');
        }
        if (l?.globalEnv && l?.globalEnv[v]) {
          this.pushDuplicate(v, section, 'globalEnv');
        }
        if (l?.global && l?.global[v]) {
          this.pushDuplicate(v, section, 'global');
        }
      });
    }

    if (this.localVarsTyped.environment) {
      const l = this.localVarsTyped;
      Object.keys(l.environment).forEach((v, i) => {
        const section = 'environment';
        if (l?.globalEnv && l?.globalEnv[v]) {
          this.pushDuplicate(v, section, 'globalEnv');
        }
        if (l?.global && l?.global[v]) {
          this.pushDuplicate(v, section, 'global');
        }
      });
    }

    if (this.localVarsTyped.globalEnv) {
      const l = this.localVarsTyped;
      Object.keys(this.localVarsTyped.globalEnv).forEach((v, i) => {
        if (l?.global && l?.global[v]) {
          this.pushDuplicate(v, 'globalEnv', 'global');
        }
      });
    }

    if (this.duplicates.length && ParamsModule.showDuplicateParams) {
      this.pkg.setBroken(`[${this.pkg.packageName}] duplicate param(s)`);
    }
  }

  getVarCounts(typedVars: any): CenvVarsCount {
    const app = typedVars?.app ? Object.keys(typedVars?.app)?.length : 0;
    const environment = typedVars?.environment ? Object.keys(typedVars?.environment)?.length : 0;
    const globalEnv = typedVars?.globalEnv ? Object.keys(typedVars?.globalEnv)?.length : 0;
    const global = typedVars?.global ? Object.keys(typedVars?.global)?.length : 0;
    return { app, environment, globalEnv, global };
  }

  async envToParamsAdd(path: string, envConfig: EnvConfig, type: string) {
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

  async envToParams(envConfig: EnvConfig): Promise<void> {
    let envFile = path.join(process.cwd(), `.env.${CenvFiles.ENVIRONMENT}`);
    await this.envToParamsAdd(envFile, envConfig, 'appType');

    envFile = path.join(process.cwd(), '.env');
    await this.envToParamsAdd(envFile, envConfig, 'environmentType');
  }

  async initParams(options?: ParamsCommandOptions) {
    try {

      if (!(await Cenv.verifyCenv())) {
        await Cenv.deployCenv();
      }
      const environment = CenvFiles.ENVIRONMENT;
      if (!environment) {
        CenvLog.single.catchLog('initParams err: environment not set');
        process.exit(81);
      }

      let appEnvConfig: IEnvConfig = await getEnvironmentAppConfigs(this.pkg.packageName) as EnvConfig;
      if (!appEnvConfig.EnvironmentId || !appEnvConfig.ConfigurationProfileId || !appEnvConfig.MetaConfigurationProfileId) {
        appEnvConfig = await createAppEnvConf(appEnvConfig);
      }

      await this.processInitData(appEnvConfig, options as Record<string, string>);

    } catch (err) {
      CenvLog.single.catchLog('Cenv.init err: ' + (err instanceof Error ? err.stack : err));
    }
  }

  public async setEnvironment(environment: string) {
    const config = await ParamsModule.GetConfig(this.pkg.packageName, environment);
    const env = await getEnvironment(config.ApplicationId!, environment, false);
    if (!env) {
      process.exit(0);
    }
    CenvLog.info(environment, 'environment set to');
    config.EnvironmentName = environment;
    config.EnvironmentId = env.EnvironmentId;
    CenvFiles.SaveEnvConfig(config);
  }

  private async pushType(vars: any, type: string, applicationName: string, updatedCount: number) {
    if (vars[type]) {
      const rootPath = CenvParams.GetRootPath(applicationName, CenvFiles.ENVIRONMENT, type);
      for (const [key, value] of Object.entries(vars[type])) {

        const parameter = await CenvFiles.decodeParameter(envVarToKey(key), value as string, type, rootPath);
        const res = await upsertParameter(applicationName, parameter, type);
        if (res !== 'SKIPPED') {
          updatedCount += 1;
        }
      }
    }
    return updatedCount;
  }

  private async processInitData(envConfig: IEnvConfig, options: Record<string, any>) {
    CenvLog.info(`${envConfig.ApplicationName}:${envConfig.EnvironmentName} - saving local files`);
    CenvFiles.SaveEnvConfig(envConfig);

    if (!options?.push && !options?.stack) {
      await this.pull(false, false, true, true);
    }

    if (options?.push) {
      await this.push(envConfig.ApplicationName, options?.materialize);
    }
  }

  public async createParameter(key: string, value: string, type: string, encrypted: boolean): Promise<{ [x: string]: IParameter }> {
    return await ParamsModule.createParameter(this.pkg.packageName, key, value, type, encrypted);
  }

  public static async createParameter(applicationName: string, key: string, value: string, type: string, encrypted: boolean): Promise<{ [x: string]: IParameter }> {
    const rootPath = CenvParams.GetRootPath(applicationName, CenvFiles.ENVIRONMENT, type);
    if (encrypted) {
      value = await encrypt(value)
      value = `--ENC=${value}`
    }
    const param: IParameter = {Value: value, Type: 'String', ParamType: type, Name: key.toLowerCase()};
    return {[`${rootPath}/${key}`]: param};
  }

  public static getComponentRef(pkg: Package) {
    return {
      key: process.env.APP!,
      path: `/globalenv/${process.env.ENV}/component/${pkg.component}/refs`
    }
  }
}
