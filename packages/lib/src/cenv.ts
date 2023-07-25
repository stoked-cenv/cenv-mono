import {CenvLog, errorBold, info, infoBold, LogLevel} from './log'
import {
  addUserToGroup,
  attachPolicyToGroup,
  attachPolicyToRole,
  createGroup,
  createPolicy,
  createRole,
  deleteGroup,
  deletePolicy,
  deleteRole,
  detachPolicyFromRole,
  getPolicy,
  getRole,
} from './aws/iam'
import {Package, PackageCmd,} from './package/package'
import {deleteFunction, getFunction} from './aws/lambda'
import {
  createApplication,
  createDeploymentStrategy,
  createEnvironment,
  deleteCenvData,
  getApplication,
  getConfigurationProfile,
  getDeploymentStrategy,
  getEnvironment
} from './aws/appConfig'
import * as chalk from 'chalk';
import * as path from 'path';
import {BaseCommandOptions, CenvParams, DashboardCreateOptions, DashboardCreator, validateOneType} from './params';
import {Environment,} from './environment';
import {Export} from '@aws-sdk/client-cloudformation';
import { getExportValue, listExports } from './aws/cloudformation';
import {CenvFiles, EnvConfig} from "./file";
import {upsertParameter} from "./aws/parameterStore";
import { createParamsLibrary, EnvVars, execCmd, getMonoRoot, packagePath, search_sync, sleep, validateEnvVars } from './utils';
import { getContextConfig, ConfigureCommandOptions, getMatchingProfileConfig, ioAppEnv, ioReadVarList } from './stdIo';
import { deleteHostedZone, listHostedZones } from './aws/route53';
import { existsSync, mkdirSync, readFileSync, rmdirSync, writeFileSync } from 'fs';
import * as child from 'child_process';
import {PackageModule} from "./package/module";
import {Template} from "./templates";
import { Suite } from './suite';
import { Version } from './version';
import { Deployment } from './deployment';
import { Dashboard } from '@stoked-cenv/ui';
import { getKey } from './aws/kms';
import { HostedZone } from '@aws-sdk/client-route-53';
import { getAccountId } from './aws/sts';

interface FlagValidation {
  application: string;
  environment: string;
  options: any;
  envConfig: EnvConfig;
}

interface IApplicationShiftExecutor {
  (envCtx: any, params: any, options: any): Promise<PackageCmd>;
}

export interface ParamsCommandOptions extends BaseCommandOptions {
  app?: boolean;
  environment?: boolean;
  global?: boolean;
  globalEnv?: boolean;
  simple?: boolean;
  detail?: boolean;
  decrypted?: boolean;
  deployed?: boolean;
  allApplications?: boolean;
  output?: string;
  test?: boolean;
  defaults?: boolean;
  envToParams?: boolean;
}

export interface NewCommandOptions extends BaseCommandOptions {
  template?: string
  packagePaths?: string[]
  force?: boolean
}

export interface InitCommandOptions extends BaseCommandOptions {
  scope?: string
}

export interface StackProc {
  cmd: string,
  proc: child.ChildProcess
  stackName?: string
}

export class Cenv {
  static runningProcesses?: { [stackName: string]: StackProc[] } = {};
  static processes: { [pid: number]: StackProc } = {};
  static dashboard: any = null;
  static cleanTags: (...text: string[]) => string[];
  static dashboardCreator: DashboardCreator;
  static dashboardCreateOptions: DashboardCreateOptions;
  static materializationPkg = '@stoked-cenv/params';
  static roleName = 'LambdaConfigRole';
  static policySsmFullAccessArn = 'arn:aws:iam::aws:policy/AmazonSSMFullAccess';
  static policyLambdaBasic = 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole';
  static keyGroupName = 'key-users';

  // from cenv.json
  static suites: any = {};
  static scopeName: string;
  static defaultSuite: string;
  static globalPackage: string;
  static primaryPackagePath: string;

  static async init(options: InitCommandOptions) {

    const {primaryPackagePath, metas} = this.getWorkspaceData();
    const folderName = path.parse(process.cwd()).name;

    const globalPackage = this.createGlobalsPackage(folderName, primaryPackagePath, options?.scope);

    const cenvConfig: any = {
      globalPackage, defaultSuite: folderName, primaryPackagePath: path.relative(process.cwd(), primaryPackagePath)
    }
    if (options?.scope) {
      cenvConfig.scope = options.scope;
    }

    cenvConfig.suites = {};
    cenvConfig.suites[folderName] = {
      "packages": metas.filter((w: { meta: any, path: string }) => !w.meta.name.endsWith('globals'))
    }

    const configOutput = JSON.stringify(cenvConfig, null, 2) + '\n';
    writeFileSync(path.join(process.cwd(), 'cenv.json'), configOutput);
    console.log(`${info('generated')} ${infoBold('cenv.json')}`)
    if (CenvLog.logLevel === LogLevel.VERBOSE) {
      console.log(info(JSON.stringify(cenvConfig, null, 2)))
    }

    await this.execCmd(`npm init -y`, {silent: true});
    await this.cmdInit({logLevel: process.env.CENV_LOG_LEVEL}, false);
  }

  static createGlobalsPackage(projectName: string, primaryPackagePath: string, scope?: string) {
    const globalsNameNoScope = projectName + '-globals';
    const globalsPath = path.join(primaryPackagePath, 'globals');
    if (!existsSync(globalsPath)) {
      mkdirSync(globalsPath, {recursive: true});
    }
    const cenvDir = path.join(globalsPath, '.cenv');
    if (!existsSync(cenvDir)) {
      mkdirSync(cenvDir);
    }
    const globalsCenvPath = path.join(cenvDir, '.cenv.globals');
    if (!existsSync(globalsCenvPath)) {
      writeFileSync(globalsCenvPath, '');
    }

    const globalsCenvEnvTemplatePath = path.join(cenvDir, '.cenv.env.globals.template');
    if (!existsSync(globalsCenvEnvTemplatePath)) {
      writeFileSync(globalsCenvEnvTemplatePath, '');
    }

    const globalsName = scope ? `${scope}/${globalsNameNoScope}` : globalsNameNoScope;
    const globalMeta = {
      "name": globalsName, "version": "0.0.1"
    };

    writeFileSync(path.join(globalsPath, 'package.json'), JSON.stringify(globalMeta, null, 2) + '\n');
    console.log(`${info('generated')} ${infoBold('globals package')}`);

    if (CenvLog.logLevel === LogLevel.VERBOSE) {
      console.log(info(JSON.stringify(globalMeta, null, 2)))
      console.log(' ')
    }
    return globalsName;
  }

  static getPackages() {
    const pkgs: string[] = search_sync(process.cwd(), false, true, 'package.json', {excludedDirs: ['cdk.out', 'node_modules', 'dist']}) as string[];
    const metas: { meta: any, path: string }[] = pkgs.map(pkgPath => {
      return {meta: require(pkgPath), path: path.parse(pkgPath).dir};
    })
    return metas;
  }

  static getWorkspaceData() {
    const metas = this.getPackages().filter(m => m.path !== process.cwd())
    let primaryPackagePath = path.join(process.cwd(), 'packages');
    let largestCount = 0;
    const pathCounts: Record<string, number> = {}
    for (let i = 0; i < metas.length; i++) {
      const pkg = metas[i];
      const containingDir = path.parse(pkg.path).dir;
      if (!pathCounts[containingDir]) {
        pathCounts[containingDir] = 1;
      } else {
        pathCounts[containingDir]++;
      }
      if (pathCounts[containingDir] > largestCount) {
        largestCount = pathCounts[containingDir];
        primaryPackagePath = containingDir
      }
    }
    const globalPackage = metas.find(m => m.meta.cenv?.globals);
    return {primaryPackagePath, metas, globalPackage};
  }

  static async new(name: string, options: NewCommandOptions) {
    const projectPath = path.join(process.cwd(), name);
    if (existsSync(projectPath)) {
      if (!options?.force) {
        CenvLog.single.alertLog(`the directory ${name} already exists, either add the --force flag to replace the existing data or choose a new directory`);
        process.exit(636);
      } else {
        rmdirSync(projectPath);
        mkdirSync(projectPath);
      }
    }
    mkdirSync(path.join(projectPath, 'packages'), {recursive: true});
    process.chdir(projectPath);
    console.log(process.cwd());
    await this.init({});

    await Template.newWeb()
  }

  static async cmdInit(options: any, cenvRootNotRequired = false): Promise<boolean> {
    try {

      CenvFiles.setPaths();

      Package.callbacks.cancelDependencies = Deployment.cancelDependencies.bind(Deployment);
      Cenv.cleanTags = (...text: string[]) => {
        return Dashboard.cleanTags(...text);
      }

      if (options?.logLevel || process.env.CENV_LOG_LEVEL) {
        options.logLevel = process.env.CENV_LOG_LEVEL?.toUpperCase() || options?.logLevel?.toUpperCase();
        const {logLevel}: { logLevel: keyof typeof LogLevel } = options;
        process.env.CENV_LOG_LEVEL = LogLevel[logLevel];
        CenvLog.logLevel = LogLevel[logLevel];
        CenvLog.single.stdLog('CENV LOG LEVEL: ' + CenvLog.logLevel)
      } else {
        process.env.CENV_LOG_LEVEL = LogLevel.INFO
        CenvLog.logLevel = LogLevel.INFO;
      }

      if (!process.env.CENV_VERSION) {
        await Version.getVersion('@stoked-cenv/cli');
        await Version.getVersion('@stoked-cenv/lib');
        await Version.getVersion('@stoked-cenv/ui');
      }

      options.args = await Cenv.configure(options as ConfigureCommandOptions);

      const monoRoot = getMonoRoot();
      if (!monoRoot && cenvRootNotRequired) {
        return true;
      }

      if (!monoRoot) {
        CenvLog.single.alertLog(`the cwd "${process.cwd()}" is not located inside a cenv folder.. run "cenv init" to initialize the current directory as a cenv project or call 'cenv new My-New-Cenv-App'`)
        process.exit(902);
      }
      const cenvConfigPath = path.resolve(monoRoot, 'cenv.json');
      if (existsSync(cenvConfigPath)) {
        const cenvConfig = require(cenvConfigPath);
        Cenv.defaultSuite = cenvConfig.defaultSuite;
        Cenv.scopeName = cenvConfig.scope;
        Cenv.suites = cenvConfig.suites;
        const suitesPath = Suite.suitePath()
        if (suitesPath) {
          if (Cenv.suites) {
            CenvLog.single.catchLog('a suites.json file is not supported when there is also a suites property in the cenv.json file');
            process.exit(687);
          } else {
            Cenv.suites = require(suitesPath);
          }
        }
        Cenv.globalPackage = cenvConfig.globalPackage;
        Cenv.primaryPackagePath = cenvConfig.primaryPackagePath
        if (cenvConfig.globalPackage) {
          const packageGlobalPath = packagePath(cenvConfig.globalPackage);
          if (!packageGlobalPath || !existsSync(packageGlobalPath)) {
            CenvLog.single.infoLog(`globals could not be loaded from the data provided in the cenv.json definition file ${cenvConfig.globalPackage} (using scope and globals property)`);
          } else if (packageGlobalPath) {
            CenvFiles.GlobalPath = path.join(packageGlobalPath, CenvFiles.PATH);
          }
        }
      } else {
        CenvLog.single.infoLog('no cenv.json configuration file exists at the root')
        return false
      }
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
    return true;
  }

  static addSpawnedProcess(stackName: string, cmd: string, proc: child.ChildProcess) {
    if (proc.pid === undefined || Cenv.processes === undefined || Cenv.runningProcesses === undefined) {
      return;
    }
    Cenv.processes[proc.pid] = {stackName, cmd, proc};

    if (!Cenv.runningProcesses[stackName]) {
      Cenv.runningProcesses[stackName] = [{cmd, proc}];
    } else {
      Cenv.runningProcesses[stackName].push({cmd, proc});
    }
  }

  static async env(params: string[], options: Record<string, any>) {
    if (!params.length) {
      CenvLog.info(`current environment: ${infoBold(process.env.ENV)}`,);
    }
    if (options.exports) {
      let exports: any = await listExports();
      if (params) {
        exports = exports.filter((e: Export) => params.includes(e.Name?.replace(`${process.env.ENV}-`, '') as string),);
        exports = exports.map((e: Export) => e.Value);
        CenvLog.single.stdLog(exports.join(' '));
        return;
      }
      CenvLog.info('exports');
      const coloredLines = exports.map((e: Export) => {
        return `\t${e.Name}: ${infoBold(e.Value)}`;
      });
      CenvLog.info(coloredLines.join('\n'));
      return;
    }
    const env = new Environment();
    await env.load();
    CenvLog.info('deployed');
    env.packages.map((p: Package) => CenvLog.info(`\t${p.packageName}`),);
  }

  static addParam = async (pkg: Package, params: string[], options: Record<string, any>) => {
    function getAddParam(application: string) {
      return `cenv add ${application ? application + ' ' : ''}${options?.app ? '-a' : ''} ${options?.environment ? '-e' : ''} ${options?.global ? '-g' : ''} ${options?.globalEnv ? '-ge' : ''}`;
    }

    const cmd = pkg.createCmd(getAddParam(pkg.packageName));
    const type = validateOneType(Object.keys(options));
    if (!type) {
      cmd.err(`Must contain at least one type flag (${infoBold('--app-type')}, ${infoBold('--environment-type',)}, 
        ${infoBold('--global-type')}, ${infoBold('--global-env-type')}`,);
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
      CenvLog.single.catchLog(new Error(`can not create a parameter without a valid value - key name ${params[0]}`))
      process.exit(912);
    }

    const ctx: any = await CenvParams.getParamsContext();
    const config = ctx.EnvConfig;
    const key = params[0].toLowerCase().replace(/_/g, '/');
    const keyPath = CenvParams.GetRootPath(ctx.EnvConfig.ApplicationName, ctx.EnvConfig.EnvironmentName, type,);
    const alreadyExistingType = await CenvFiles.KeyExists(key, keyPath, type);
    if (alreadyExistingType) {
      const error = `Attempted to add key "${errorBold(key)}" as ${type === 'global' ? 'a' : 'an'} "${errorBold(type)}" param type, but this key already exists as ${alreadyExistingType === 'global' ? 'a' : 'an'} "${errorBold(alreadyExistingType)}" param`;
      cmd.err(error);
      cmd.result(4);
      return cmd;
    }

    const parameter = await CenvFiles.createParameter(config, key, value, type, options.decrypted,);
    const res = await upsertParameter(config, parameter, type);
    await new Promise((r) => setTimeout(r, 2000));
    if (res !== 'SKIPPED') {
      await new Promise((r) => setTimeout(r, 2000));
      await CenvParams.pull(false, false, false);
    }
    if (options?.stack) {
      cmd.out(`deploying ${infoBold(config.ApplicationName,)} configuration to environment ${chalk.blueBright(config.EnvironmentName,)}`,);
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

  static async envToParams(envConfig: EnvConfig) {
    const envFile = path.join(process.cwd(), '.env');
    if (existsSync(envFile)) {
      const envData = readFileSync(envFile, 'utf-8');
      const lines = envData.split('\n');
      const pkg = Package.fromPackageName(envConfig.ApplicationName)
      await Promise.all(lines.map(async (line: string) => {
        const keyValue = line.split('=')
        if (keyValue.length === 2) {
          const key = keyValue[0].trim();
          const value = keyValue[1].trim();
          if (key.length > 1 && value.length > 1) {
            await Cenv.addParam(pkg, [key, value], {appType: true});
          }
        }
      }))
    }
  }

  static async initParams(options?: ParamsCommandOptions, tags: string[] = []) {
    try {
      const flagValidateResponse = this.initFlagValidation(options);

      let {application, environment, envConfig} = flagValidateResponse;
      options = flagValidateResponse.options;

      if (!(await this.verifyCenv())) {
        await this.deployCenv();
      }

      const appEnvNameRes = await this.processApplicationEnvironmentNames(options as Record<string, string>, application, environment, envConfig,);
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
        CenvLog.single.errorLog('could not look up the params configuration from the envConfig: ' + JSON.stringify(envConfig, null, 2))
        return;
      }
      await this.processInitData(confProf, options as Record<string, string>);

      if (options?.envToParams) {
        await this.envToParams(envConfig);
      }
    } catch (err) {
      CenvLog.single.catchLog('Cenv.init err: ' + (err instanceof Error ? err.stack : err));
    }
  }

  public static async destroyAppConfig(application: string, options: Record<string, any>) {
    await deleteCenvData(application, options?.parameters || options?.all, options?.config || options?.all, options?.all || options?.global,);
    return true;
  }

  static async verifyCenv(silent = true) {
    try {
      // const cmd = mat.createCmd('cenv deploy --verify');
      const AppConfigGetArn = `arn:aws:iam::${process.env.CDK_DEFAULT_ACCOUNT}:policy/AppConfigGod`;
      const KmsPolicyArn = `arn:aws:iam::${process.env.CDK_DEFAULT_ACCOUNT}:policy/KmsPolicy`;

      const componentsMissing: Array<[string, string]> = [];
      let verified = true;
      const depStratRes = await getDeploymentStrategy();
      if (!depStratRes || !depStratRes.DeploymentStrategyId) {
        verified = false;
        componentsMissing.push(['Deployment Strategy', 'Instant.AllAtOnce']);
      }
      const policyExists = await getPolicy(AppConfigGetArn);
      if (!policyExists) {
        verified = false;
        componentsMissing.push(['IAM Policy', 'AppConfigGod']);
      }

      const roleExists = await getRole('LambdaConfigRole');
      if (!roleExists) {
        verified = false;
        componentsMissing.push(['IAM Role', 'LambdaConfigRole']);
      }
      const materializationExists = await getFunction('cenv-params');
      if (!materializationExists) {
        verified = false;
        componentsMissing.push(['Materialization Lambda', 'cenv-params',]);
      }
      if (!silent) {
        if (!verified) {
          CenvLog.info(`cenv failed validation with the following missing components:`,);
          componentsMissing.map((component) => CenvLog.info(` - ${component[0]} (${infoBold(component[1])})`,),);
        } else {
          CenvLog.info('cenv www has been verified');
        }
      }
      //const res = verified ? 0 : 1;
      //await cmd?.result(res);
      return verified;
    } catch (e) {
      CenvLog.single.catchLog(e)
    }
  }

  static async deployCenv(force = false): Promise<void> {
    try {
      //const envVars = validateEnvVars(['AWS_ACCOUNT_USER_ARN'])
      const cmdText = `cenv deploy -cenv${force ? ` --force` : ''}`;
      //const cmd = mat ? mat.createCmd(cmdText) : PackageCmd.createCmd(cmdText);

      if (force) {
        //cmd.out('force destroy cenv');
        await this.destroyCenv();
      }

      const AppConfigGetArn = `arn:aws:iam::${process.env.CDK_DEFAULT_ACCOUNT}:policy/AppConfigGod`;
      const roleArn = `arn:aws:iam::${process.env.CDK_DEFAULT_ACCOUNT}:role/${this.roleName}`;
      const KmsPolicyArn = `arn:aws:iam::${process.env.CDK_DEFAULT_ACCOUNT}:policy/KmsPolicy`;

      const depStratRes = await getDeploymentStrategy();
      if (!depStratRes || !depStratRes.DeploymentStrategyId) {
        await createDeploymentStrategy();
      }
      const policyExists = await getPolicy(AppConfigGetArn);
      if (!policyExists) {
        const polRes = await createPolicy('AppConfigGod', JSON.stringify({
                                                                           Version: '2012-10-17', Statement: [{
            Action: 'appconfig:*', Resource: '*', Effect: 'Allow',
          }, {
            Action: 'lambda:*', Resource: '*', Effect: 'Allow',
          },],
                                                                         }),);
      }

      const roleExists = await getRole(this.roleName);
      if (!roleExists) {
        const roleRes = await createRole(this.roleName, JSON.stringify({
                                                                         Version: '2012-10-17', Statement: [{
            Effect: 'Allow', Principal: {
              Service: 'lambda.amazonaws.com',
            }, Action: 'sts:AssumeRole',
          },],
                                                                       }),);
        if (!roleRes) {
          return;
        }
      }

      if (process.env.KMS_KEY) {
        const KmsPolicyExists = await getPolicy(KmsPolicyArn);
        if (!KmsPolicyExists) {
          const polRes = await createPolicy('KmsPolicy', JSON.stringify({
                                                                          Version: '2012-10-17', Statement: [{
              Effect: 'Allow',
              Action: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey',],
              Resource: process.env.KMS_KEY,
            },],
                                                                        }),);

          if (!polRes) {
            return;
          }
        }

        const group = await createGroup(this.keyGroupName);
        const attRes = await attachPolicyToGroup(this.keyGroupName, 'KmsPolicy', KmsPolicyArn,);
        const groupUser = await addUserToGroup(this.keyGroupName, process.env.AWS_ACCOUNT_USER_ARN!.split('/')[1],);

        const polRes = await attachPolicyToRole(this.roleName, KmsPolicyArn);
        if (!polRes) {
          return;
        }
      }

      let polAttRes = await attachPolicyToRole(this.roleName, 'arn:aws:iam::aws:policy/AmazonSSMFullAccess',);
      if (!polAttRes) {
        return;
      }

      polAttRes = await attachPolicyToRole(this.roleName, AppConfigGetArn);
      if (!polAttRes) {
        return;
      }

      polAttRes = await attachPolicyToRole(this.roleName, 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',);
      if (!polAttRes) {
        return;
      }

      CenvLog.single.infoLog(`sleep for 8 seconds because if we try to use the role we just created too soon it will fail ${infoBold('🙄')}`);
      await sleep(8);
      // iam client => waitUntilRoleExists

      const materializationExists = await getFunction('cenv-params');
      if (!materializationExists) {
        const zipFile = await createParamsLibrary();
        //const materializationRes = await createLambdaApi('cenv-params', handler, roleArn,{},{  ApplicationName: '@stoked-cenv/params',EnvironmentName: process.env.ENV },);
      }
    } catch (e) {
      CenvLog.single.catchLog('Cenv.deployCenv err: ' + (e instanceof Error ? e.stack : e));
    }
  }

  static async destroyCenv(): Promise<boolean> {
    //const envVars = validateEnvVars(['ROOT_DOMAIN', 'CDK_DEFAULT_ACCOUNT', 'ENV'])
    let destroyedAnything = false;
    try {
      const KmsPolicyArn = `arn:aws:iam::${process.env.CDK_DEFAULT_ACCOUNT}:policy/KmsPolicy`;
      const AppConfigGetArn = `arn:aws:iam::${process.env.CDK_DEFAULT_ACCOUNT}:policy/AppConfigGod`;

      const materializationExists = await getFunction('cenv-params');
      if (materializationExists) {
        destroyedAnything = true;
        const materializationRes = await deleteFunction('cenv-params');
        if (!materializationRes) {
          return false;
        }
      }

      const roleExists = await getRole(this.roleName);
      const KmsPolicyExists = await getPolicy(KmsPolicyArn);
      const policyExists = await getPolicy(AppConfigGetArn);
      const ssmPolicyExists = await getPolicy(this.policySsmFullAccessArn);

      if (roleExists) {
        destroyedAnything = true;
        await detachPolicyFromRole(this.roleName, this.policyLambdaBasic);
        if (ssmPolicyExists) {
          await detachPolicyFromRole(this.roleName, this.policySsmFullAccessArn);
        }
        if (policyExists) {
          await detachPolicyFromRole(this.roleName, AppConfigGetArn);
        }
        if (KmsPolicyExists) {
          //console.log('KmsPolicyExists', JSON.stringify(KmsPolicyExists, null, 2))
          await detachPolicyFromRole(this.roleName, KmsPolicyArn);
        }
        //console.log(JSON.stringify(roleExists, null, 2));
        const roleRes = await deleteRole(this.roleName);
        if (!roleRes) {
          return false;
        }
      }

      if (process.env.KMS_KEY) {
        const groupDelRes = await deleteGroup(this.keyGroupName, false);

        if (KmsPolicyExists) {
          destroyedAnything = true;
          const polRes = await deletePolicy(KmsPolicyArn);
          if (!polRes) {
            return false;
          }
        }
      }
      if (policyExists) {
        destroyedAnything = true;
        const polRes = await deletePolicy(AppConfigGetArn);
      }

      if (process.env.ENV === 'local') {
        destroyedAnything = true;
        await deleteHostedZone(process.env.ROOT_DOMAIN!);
      }

    } catch (e) {
      CenvLog.single.catchLog('Cenv.destroyCenv err: ' + (e instanceof Error ? e.stack : e));
    }
    return destroyedAnything;
  }

  static BumpChanged() {
    const packages = Object.values(Package.cache);
    const changed = packages.filter((p: Package) => p.hasChanged());
  }

  static async execCmd(cmd: string, options: {
    envVars?: any;
    cenvVars?: any;
    pkgCmd?: PackageCmd;
    redirectStdErrToStdOut?: boolean;
    failOnError?: boolean;
    packageModule?: PackageModule;
    output?: boolean;
    silent?: boolean
  } = {
    envVars: {}, cenvVars: {}, redirectStdErrToStdOut: false, output: false, silent: false
  }) {
    try {

      const pkgPath = options?.packageModule ? options.packageModule.path : process.cwd();
      if (!options.failOnError) {
        options.failOnError = false;
      }
      const out = await execCmd(pkgPath, cmd, cmd, options.envVars, false, options?.silent);
      if (options?.silent !== false) {
        CenvLog.single.infoLog(out);
      }
      return out;
    } catch (e) {
      CenvLog.single.errorLog('cenv execCmd error: \n' + (e instanceof Error ? e.stack : e));
      return e;
    }
  }

  private static initFlagValidation(options?: Record<string, any>): FlagValidation {
    if (options?.environment) {
      process.env.ENV = options.environment;
    }
    if (options?.stack && options?.push) {
      CenvLog.single.alertLog('The --push is redundant. It is implied when used with --deploy',);
    } else if (options?.stack) {
      options.push = true;
    }

    const envConfig: EnvConfig = CenvFiles.GetConfig(options?.environment || process.env.ENV);

    if (!options?.destroy && !options?.clean && envConfig && envConfig?.ApplicationId && options?.application && envConfig.ApplicationName !== options.application) {
      CenvLog.single.errorLog('Must use --destroy or --clean with an existing config if --application is used',);
      process.exit(0);
    }


    // exitWithoutTags(tags);
    return {application: options?.application, environment: envConfig.EnvironmentName, options, envConfig};
  }

  private static async processApplicationEnvironmentNames(options: Record<string, any>, application: string, environment: string, envConfig: EnvConfig) {
    const pkgPath = search_sync(process.cwd(), true) as string[];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require(pkgPath[0].toString());

    if (!environment && process.env.ENV) {
      environment = process.env.ENV;
    }

    if (!application || !environment || options?.force) {
      const appEntry = {value: application, defaultValue: pkg.name};
      const envEntry = {value: environment, defaultValue: 'local'};
      const ioAppEnvRes = await ioAppEnv(envConfig, appEntry, envEntry, options?.force, options?.defaults,);
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
    return {application, environment};
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

      const parameter = await CenvFiles.createParameter(envConfig, 'application/name', application, 'app', false,);
      const res = await upsertParameter(envConfig, parameter, 'app');
    } else {
      envConfig.ApplicationId = appRes.ApplicationId;
    }
    return {createdApp, envConfig};
  }

  private static async processEnvironment(envConfig: EnvConfig, application: string, environment: string) {
    let createdEnv = false;
    envConfig.EnvironmentName = environment;
    const existingEnv = await getEnvironment(envConfig.ApplicationId, environment, true,);

    if (!existingEnv) {
      createdEnv = true;
      const env = await createEnvironment(envConfig.ApplicationId, environment);
      envConfig.EnvironmentId = env.Id;

      const parameter = await CenvFiles.createParameter(envConfig, 'environment/name', environment, 'globalEnv', false,);
      const res = await upsertParameter(envConfig, parameter, 'globalEnv');
    } else {
      envConfig.EnvironmentId = existingEnv.EnvironmentId;
    }
    return {createdEnv, envConfig};
  }

  private static async processConfigurationProfile(envConfig: EnvConfig) {
    const confProf = await getConfigurationProfile(envConfig.ApplicationId, 'config');

    if (!confProf || !confProf.ConfigurationProfileId) {
      return false;
    }
    envConfig.ConfigurationProfileId = confProf.ConfigurationProfileId;
    const deploymentStratRes = await getDeploymentStrategy();
    if (!deploymentStratRes || !deploymentStratRes.DeploymentStrategyId) {
      return false
    }
    envConfig.DeploymentStrategyId = deploymentStratRes.DeploymentStrategyId;
    return envConfig;
  }

  private static async processInitData(envConfig: EnvConfig, options: Record<string, any>) {
    CenvLog.info(`${envConfig.ApplicationName}:${envConfig.EnvironmentName} - saving local files`,);
    CenvFiles.SaveEnvConfig(envConfig);

    if (!options?.push && !options?.stack) {
      await CenvParams.pull(false, false, true, true);
    }

    if (options?.push) {
      await CenvParams.push(options?.stack);
    }
  }

  static async getAccountInfo() {
    const callerIdentity: any = await getAccountId();
    if (!callerIdentity) {
      return false;
    }
    return {
      CDK_DEFAULT_ACCOUNT: callerIdentity.Account,
      AWS_ACCOUNT_USER: callerIdentity.User,
      AWS_ACCOUNT_USER_ARN: callerIdentity.UserArn
    };
  }

  static async configure(options: any, alwaysAsk = false) {

    // verify that we need a config at all
    if (!alwaysAsk) {
      const contextConfig = getContextConfig();
      if (contextConfig) {
        return contextConfig;
      }

    }
    const profileData = await getMatchingProfileConfig(true, options?.profile, options?.env);

    let envConfig = profileData?.envConfig;

    const { ROOT_DOMAIN, AWS_PROFILE, AWS_REGION, ENV } = process.env;
    const envVarList = new EnvVars({...profileData?.envConfig, ...{ ROOT_DOMAIN, AWS_PROFILE, AWS_REGION, ENV }});
    if (!envConfig || (alwaysAsk && !options?.show)) {
      envVarList.setVars(envConfig || {
        AWS_PROFILE: options?.profile || 'default', AWS_REGION: 'us-east-1', ENV: 'dev'
      });

      if (!process.env.CENV_DEFAULTS || alwaysAsk) {
        envVarList.setVars(await ioReadVarList(envVarList.all));
      }
      const accountInfo: any = await this.getAccountInfo();
      envVarList.add(accountInfo);
      //await setSession(envVarList.get(accountInfo.));

      const awsCredsFile = path.join(process.env.HOME!, '.aws/credentials');
      if (existsSync(awsCredsFile)) {
        const credentials = readFileSync(awsCredsFile, 'utf8')
        const prof = credentials.split(`[${envVarList.get('AWS_PROFILE')}]`)[1]?.split('[')[0];
        envVarList.set('AWS_ACCESS_KEY_ID', prof?.split('aws_access_key_id = ')[1]?.split('\n')[0]);
        envVarList.set('AWS_SECRET_ACCESS_KEY', prof?.split('aws_secret_access_key = ')[1]?.split('\n')[0]);
      }
      if (!envVarList.check('KMS_KEY') && options?.key) {
        const kmsKey = await getKey();
        envVarList.setVars(await ioReadVarList({KMS_KEY: kmsKey}));
      }

      // TODO: cycle through the hosted zones instead of having the user type it in..
      if (!envVarList.check('ROOT_DOMAIN')) {
        const defaultRootDomainPath = path.join(CenvFiles.ProfilePath, `default-root-domain`);
        let defaultRootDomain: string | undefined = undefined;
        if (existsSync(defaultRootDomainPath)) {
          defaultRootDomain = readFileSync(defaultRootDomainPath, 'utf8');
        }

        const hostedZones = await listHostedZones();
        if (hostedZones && hostedZones.length) {
          let domain: string | undefined = undefined;
          if (defaultRootDomain !== undefined) {
            const defaultZone = hostedZones.find((hz: HostedZone) => hz.Name && hz.Name.indexOf(defaultRootDomain) > -1)
            if (defaultZone) {
              domain =  defaultZone.Name!.slice(0, -1);
            }
          } else if (!domain) {
            const recordSetCountSorted = hostedZones.filter((hz: HostedZone) => hz.ResourceRecordSetCount)
                                                    .sort(({ResourceRecordSetCount: a}, {ResourceRecordSetCount: b}) => b as number - (a as number));
            if (recordSetCountSorted.length > 0) {
              domain = recordSetCountSorted[0].Name!.slice(0, -1);
            } else {
              domain = hostedZones[0].Name!.slice(0, -1);
            }
          }
          const userSelected = await ioReadVarList( { ROOT_DOMAIN: domain });
          envVarList.set('ROOT_DOMAIN', userSelected.ROOT_DOMAIN);

          // TODO: does the zone they typed appear in our list of available zones?
        }
      }

      if (!existsSync(CenvFiles.ProfilePath)) {
        mkdirSync(CenvFiles.ProfilePath, {recursive: true});
      }
      writeFileSync(profileData.profilePath, JSON.stringify(envVarList.all, null, 2));
      envConfig = envVarList.all;
    }

    for (const [key, value] of Object.entries(envConfig) as [string, string][]) {
      envVarList.set(key, value);

      if (key === 'AWS_REGION') {
        envVarList.set('CDK_DEFAULT_REGION', value);
      }
    }

    if (!envVarList.get('CDK_DEFAULT_ACCOUNT') || !envVarList.get('AWS_ACCOUNT_USER') || !envVarList.get('AWS_ACCOUNT_USER_ARN')) {
      const accountInfo: any = await this.getAccountInfo();
      if (!accountInfo) {
        process.exit(9);
      } else {
        envVarList.add(accountInfo);
      }
    }

    if (!process.env['KMS_KEY']) {
      const kmsKey = await getKey();
      if (kmsKey) {
        envVarList.set('KMS_KEY', kmsKey);
      }
    }

    envVarList.set('VITE_APP_ROOT_DOMAIN', envVarList.get('ROOT_DOMAIN') as string);
    envVarList.set('VITE_APP_ENV', envVarList.get('ENV') as string);

    const cidr = await getExportValue('cidr', true);
    if (cidr) {
      envVarList.set('CENV_NETWORK_CIDR', 'cidr')
    }

    // because cdk logs everything to stderr by default.. fucking annoying..
    envVarList.set('CI', 'true')

    if (options?.show) {
      CenvLog.single.infoLog(`${JSON.stringify(envVarList.all, null, 2)}`);
    }
    return envVarList.all;
  }

}
