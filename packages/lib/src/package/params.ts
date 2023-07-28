import {IPackageModule, PackageModule, PackageModuleType} from './module';
import {AppVars, AppVarsFile, CenvFiles, CenvVars, EnvConfig, EnvConfigFile, VarList} from '../file';
import * as path from 'path';
import {join} from 'path';
import {existsSync} from 'fs';
import {destroyAppConfig, destroyRemainingConfigs, getConfig} from '../aws/appConfig';
import {CenvParams} from '../params';
import {CenvLog, colors} from '../log.service';
import {expandTemplateVars, simplify, validateEnvVars} from '../utils';
import {decryptValue, deleteParametersByPath, isEncrypted, stripPath} from '../aws/parameterStore';
import {Semaphore} from 'async-mutex';
import {getConfigVars} from "../aws/appConfigData";
import {Package, TPackageMeta} from "./package";

//

export class CenvVarsCount {
  app = 0;
  environment = 0;
  globalEnv = 0;
  global = 0;
}

export class ParamsModule extends PackageModule {
  static semaphore = new Semaphore(2);
  static showDuplicateParams = false;
  localConfig: EnvConfig = new EnvConfig()
  deployedConfig: EnvConfig = new EnvConfig()
  pushedVarsTyped?: CenvVars;
  pushedVars?: VarList;
  localVars?: VarList;
  localVarsTyped = new CenvVars();
  materializedVars: VarList = {};
  materializedVarsVersion?: number;
  hasCenvVars: boolean = false;
  hasLocalConfig: boolean= false;
  varsUpToDateFlag: boolean = false;
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

  constructor(pkg: Package, path: string, meta: TPackageMeta) {
    super(pkg, path, meta, PackageModuleType.PARAMS);
    CenvFiles.ENVIRONMENT = process.env.ENV!;
    this.hasCenvVars = existsSync(join(this.path, CenvFiles.PATH, AppVarsFile.NAME));
    this.hasLocalConfig = existsSync(join(this.path, CenvFiles.PATH, EnvConfigFile.NAME));
    if (this.hasLocalConfig) {
      if (process.cwd() !== this.path) {
        process.chdir(this.path);
      }
      this.localConfig = CenvFiles.LoadEnvConfig();
    }
  }

  get anythingDeployed(): boolean {
    return (this.hasCenvVars && (this.varsUpToDateFlag || !!this.materializedVarsVersion || !!this.deployedConfig || (this.pushedVars && Object.keys(this.pushedVars).length > 0) || !!(this.materializedVars && Object.keys(this.materializedVars).length > 0)));
  }

  public get localConfigValid() {
    const mergedConfig = {...this.localConfig, ...this.deployedConfig};
    return (this.localConfig && this.deployedConfig && JSON.stringify(mergedConfig) === JSON.stringify(this.localConfig));
  }

  public get varsCanDeploy() {
    return (this.localConfig?.ApplicationId !== undefined && this.localConfig?.EnvironmentId !== undefined && this.localConfig?.ConfigurationProfileId !== undefined);
  }

  get moduleStrings(): string[] {
    let items = super.moduleBaseStrings;
    if (this.duplicates.length && ParamsModule.showDuplicateParams) {
      items = items.concat(this.printAllDuplicates().map((d) => colors.error(d)));
    }

    if (!this.pushedCounts) {
      return items;
    }

    const getColor = (valid: boolean) => valid ? colors.std : colors.error;
    const getColorBold = (valid: boolean) => valid ? colors.stdBold : colors.errorBold;

    const appColor = getColor(this.appValid);
    const appBold = getColorBold(this.appValid);
    const envColor = getColor(this.envValid)
    const envBold = getColorBold(this.envValid);
    const geColor = getColor(this.geValid);
    const geBold = getColorBold(this.geValid);
    const gColor = getColor(this.gValid);
    const gBold = getColorBold(this.gValid);
    const tColor = getColor(this.totalsMatch);
    const tBold = getColorBold(this.totalsMatch);

    if (this.pushedCounts) {
      items.push(appColor(`[${appBold('app')}] local: ${appBold(this.localCounts?.app,)}, pushed: ${appBold(this.pushedCounts?.app)}`,),);
      items.push(envColor(`[${envBold('environment')}] local: ${envBold(this.localCounts?.environment,)}, pushed: ${envBold(this.pushedCounts?.environment)}`,),);
      items.push(geColor(`[${geBold('globalEnv')}] local: ${geBold(this.localCounts?.globalEnv,)}, pushed: ${geBold(this.pushedCounts?.globalEnv)}`,),);
      items.push(gColor(`[${gBold('global')}] local: ${gBold(this.localCounts?.global,)}, pushed: ${gBold(this.pushedCounts?.global)}`,),);
      items.push(tColor(`totals - local: ${tBold(this.localTotal)} pushed: ${tBold(this.pushedTotal,)} materialized: ${tBold(this.materializedTotal)}`,),);
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

  async destroy(parameterStore = true, appConfig = true) {
    if (parameterStore) {
      await deleteParametersByPath(`/service/${stripPath(this.pkg.packageName)}`, '    -', this.pkg.packageName);
    }
    if (appConfig) {
      await destroyAppConfig(this.pkg.packageName, false);
    }
  }

  async loadVars() {
    // switch dir
    if (!this.varsLoaded) {
      const toDirVars = path.relative(process.cwd(), this.path);
      if (toDirVars !== '') {
        process.chdir(toDirVars);
      }

      // load config
      CenvFiles.LoadEnvConfig(process.env.ENV);
      const config = CenvFiles.GetConfig();

      // get deployed vars
      this.cenvVars = await getConfigVars(true);
    }
    if (CenvLog.isInfo) {
      this.pkg.stdPlain('# cenv vars')
      this.pkg.printEnvVars(this.cenvVars)
    }

    if (CenvLog.isVerbose && process.env.CENV_ENV_VARS_VERBOSE) {
      this.pkg.stdPlain('# env vars')
      this.pkg.printEnvVars(process.env as Record<string, string>)
    }
    this.varsLoaded = true;
  }

  async deploy(options: any) {
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

  async checkVarsUpToDate(): Promise<boolean> {
    if (this.varsUpToDateFlag) {
      return this.varsUpToDateFlag;
    }
    try {
      let expandedMaterializedVars: any = {};
      if (this.materializedVars) {
        expandedMaterializedVars = expandTemplateVars(JSON.parse(JSON.stringify(this.materializedVars)),);
      }
      let expandedPushedVars: any = {};
      if (this.pushedVars) {
        expandedPushedVars = expandTemplateVars(JSON.parse(JSON.stringify(this.pushedVars)),);
      }
      const expandedLocalVars = expandTemplateVars(JSON.parse(JSON.stringify(this.localVars)),);

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
          this.pkg.info(`[${this.pkg.stackName}] local -> {${key}: ${val}} does not match pushed -> {${key}: ${pushVal}}`,);
          this.needsDeploy = true;
          match = false;
          valueMatch = false;
          this.unmatchedDeployedVars.push(key);
        }
        if (expandedMaterializedVars[key] !== val) {
          this.pkg.info(`[${this.pkg.stackName}] local -> {${key}: ${val}} does not match materialized -> {${key}: ${expandedMaterializedVars[key]}}`,);
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
          this.pkg.info(`[${this.pkg.stackName}] pushed -> {${key}: ${val}} does not match materialized -> {${key}: ${expandedMaterializedVars[key]}}`,);
          this.needsMaterialization = true;
          match = false;
          this.unmatchedMaterializedVars.push(key);
          if (this.unmatchedVarValues.indexOf(key) === -1) {
            this.unmatchedVarValues.push(key);
          }
        }
      }

      if (Object.keys(expandedPushedVars)?.length !== Object.keys(expandedLocalVars)?.length) {
        this.processStatus = this.statusLine('deployed vars not in sync', "deployed var count doesn't match local", true,);
      } else if (Object.keys(expandedMaterializedVars)?.length !== Object.keys(expandedPushedVars)?.length && !this.duplicates.length) {
        this.materializationStatus = this.statusLine(`materialized vars not in sync`, "materialized var count doesn't match deployed", true,);
      } else if (this.unmatchedDeployedVars?.length) {
        this.processStatus = this.statusLine(`orphaned deployed vars`, "deployed var values don't match local or materialized vars", true,);
      } else if (this.unmatchedMaterializedVars?.length) {
        this.materializationStatus = this.statusLine(`orphaned materialized vars`, "materialized var values don't match local or pushed vars", true,);
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

  varsUpToDate() {
    return !this.hasCenvVars || this.varsUpToDateFlag;
  }

  async fixDupes() {
    try {
      for (const key of Object.keys(this.localVarsTyped.globalEnv) as string[]) {
        if (this.localVarsTyped.app[key as keyof AppVars]) {
          this.pkg.alert(`${key} from app and keeping the version in globalEnv`, 'remove parameter');
          await CenvParams.removeParameters([key], {}, ['app'], false);
        }
        if (this.localVarsTyped.environment[key]) {
          this.pkg.alert(`${key} from environment and keeping the version in globalEnv`, 'remove parameter');
          await CenvParams.removeParameters([key], {}, ['environment'], false);
        }
      }
      for (const key of Object.keys(this.localVarsTyped.global) as string[]) {
        if (this.localVarsTyped.app[key]) {
          this.pkg.alert(`${key} from app and keep the version in global`, 'remove parameter');
          await CenvParams.removeParameters([key], {}, ['app'], false)
        }
        if (this.localVarsTyped.environment[key]) {
          this.pkg.alert(`${key} from environment and keep the version in global`, 'remove parameter');
          await CenvParams.removeParameters([key], {}, ['environment'], false);
        }
        if (this.localVarsTyped.globalEnv[key]) {
          this.pkg.alert(`${key} from globalEnv and keeping the version in global`, 'remove parameter');
          await CenvParams.removeParameters([key], {}, ['globalEnv'], false);
        }
      }
      await CenvParams.pull(false, false, true, false, true, true, undefined, false);
      await this.pkg.checkStatus();
    } catch (e) {
      CenvLog.single.errorLog('fix dupes' + e, this.pkg.stackName);
    }
  }

  getDetails() {
    if (this.duplicates.length && ParamsModule.showDuplicateParams) {
      this.status.needsFix.push(this.statusLineType('duplicates', `param(s) exist in more than one param type\n\t${this.printAllDuplicates().join('\n\t',)}`, 'needsFix',),);
    }

    if (this.varsUpToDate() && this.hasCenvVars) {
      this.status.deployed.push(this.statusLineType('up to date', 'local vars, pushed vars, and deployed vars are in sync', 'deployed',),);
    } else {

      if (!this.localConfigValid) {
        this.status.incomplete.push(this.statusLineType('needs deploy', 'no config or config invalid', 'incomplete',));
      } else if (!this.totalsMatch) {
        if (this.localTotal !== this.pushedTotal) {
          this.status.incomplete.push(this.statusLineType('pushed param count mismatch', `local param count: ${this.localTotal} pushed param count: ${this.pushedTotal}`, 'incomplete',));
        } else if (this.materializedTotal === 0) {
          this.status.incomplete.push(this.statusLineType('params not materialized', `none of the ${this.localTotal} params have been materialized`, 'incomplete',));
        } else if (this.materializedTotal !== this.materializedTotalExpected && !this.duplicates.length) {
          this.status.incomplete.push(this.statusLineType('materialized mismatch', `pushed count: ${this.pushedTotal} materialized count: ${this.materializedTotal}`, 'incomplete',));
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
    this.varsUpToDateFlag = false;
    this.localVarsTyped = new CenvVars();
    this.localVars = undefined;
    this.pushedVars = undefined;
    this.pushedVarsTyped = undefined;
    this.materializedVars = {};
    this.localCounts = new CenvVarsCount();
    this.pushedCounts = new CenvVarsCount();
    this.materializedTotal = 0;
    this.duplicates = [];
    this.materializedVarsVersion = undefined;
    this.deployedConfig = new EnvConfig()
    this.status = {needsFix: [], deployed: [], incomplete: []};
  }

  statusIssues() {
    const paramsUpToDate = !this?.hasCenvVars || this?.varsUpToDateFlag
    this.verbose(`hasCenvVars: [${this?.hasCenvVars}] varsUpToDateFlag: [${this?.varsUpToDateFlag}] paramsUpToDate: ${paramsUpToDate}`, 'params status debug');
  }

  printCheckStatusComplete(): void {
    let status = `loaded local params file: ${EnvConfigFile.PATH}\n`
    let end = '';
    if (this.localVars) {
      status += `local params count [${Object.keys(this.localVars).length}]`;
      end = '\n'
    }
    if (this.pushedVars) {
      status += end + `pushed params count [${Object.keys(this.pushedVars).length}]`;
      end = '\n'
    }
    if (this.materializedVars) {
      status += end + `materialized params count [${Object.keys(this.materializedVars).length}]`
    }
    this.info(status);
    this.checked = true;
    this.getDetails();
  }

  async checkStatus() {
    try {
      if (!this.pkg) {
        return;
      }
      this.printCheckStatusStart();
      const depRes = await getConfig(this.name);
      if (depRes) {
        this.deployedConfig = depRes.config
        this.materializedVarsVersion = depRes.version;
      }
      const relative = path.relative(process.cwd(), this.path);
      if (relative !== '') {
        process.chdir(relative);
      }
      this.localConfig = CenvFiles.LoadEnvConfig();
      if (!this.localConfig) {
        const configRes = await getConfig(this.name);
        if (configRes) {
          CenvFiles.SaveEnvConfig(configRes.config);
          this.localConfig = configRes.config;
        }
      }
      if (this.localConfig) {
        this.localVarsTyped = await CenvFiles.GetVars(true, false);
        this.localCounts = this.getVarCounts(this.localVarsTyped);
        this.checkForDuplicates();

        if (depRes) {
          CenvFiles.EnvConfig = this.deployedConfig;
          const relative = path.relative(process.cwd(), this.path);
          if (relative !== '') {
            process.chdir(relative);
          }

          this.localVars = this.convertToCenvVars(this.localVarsTyped);
          this.pushedVarsTyped = await CenvParams.pull(false, false, true, false, false, false, this.deployedConfig);
          this.pushedCounts = this.getVarCounts(this.pushedVarsTyped);
          this.pushedVars = this.convertToCenvVars(this.pushedVarsTyped);
          if (this.materializedVarsVersion) {
            this.materializedVars = await CenvParams.pull(true, false, true, false, false, false, this.deployedConfig, true,);
          }
          await this.checkVarsUpToDate();
        }
      }

      this.printCheckStatusComplete()
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }

  pushDuplicate(key: string, section: string, dupeSection: any) {
    const exists = this.duplicates.find(d => d.key === key);
    if (exists) {
      exists.types.push(dupeSection);
      exists.types = [...new Set(exists.types)];
    } else {
      this.duplicates.push({key, types: [section, dupeSection]});
    }
  }

  checkForDuplicates() {
    if (this.localVarsTyped.app) {
      Object.keys(this.localVarsTyped?.app).forEach((v, i) => {
        const section = 'app'
        if (this.localVarsTyped?.environment[v]) {
          this.pushDuplicate(v, section, 'environment');
        }
        if (this.localVarsTyped?.globalEnv[v]) {
          this.pushDuplicate(v, section, 'globalEnv');
        }
        if (this.localVarsTyped?.global[v]) {
          this.pushDuplicate(v, section, 'global');
        }
      });
    }

    if (this.localVarsTyped.environment) {
      Object.keys(this.localVarsTyped.environment).forEach((v, i) => {
        const section = 'environment'
        if (this.localVarsTyped?.globalEnv[v]) {
          this.pushDuplicate(v, section, 'globalEnv');
        }
        if (this.localVarsTyped?.global[v]) {
          this.pushDuplicate(v, section, 'global');
        }
      });
    }

    if (this.localVarsTyped.globalEnv) {
      Object.keys(this.localVarsTyped.globalEnv).forEach((v, i) => {
        if (this.localVarsTyped?.global[v]) {
          this.pushDuplicate(v, 'globalEnv', 'global');
        }
      });
    }

    if (this.duplicates.length && ParamsModule.showDuplicateParams) {
      this.pkg.setBroken(`[${this.pkg.packageName}] duplicate param(s)`)
    }
  }

  getVarCounts(typedVars: any): CenvVarsCount {
    const app = typedVars?.app ? Object.keys(typedVars?.app)?.length : 0;
    const environment = typedVars?.environment ? Object.keys(typedVars?.environment)?.length : 0;
    const globalEnv = typedVars?.globalEnv ? Object.keys(typedVars?.globalEnv)?.length : 0;
    const global = typedVars?.global ? Object.keys(typedVars?.global)?.length : 0;
    return {app, environment, globalEnv, global};
  }
}
