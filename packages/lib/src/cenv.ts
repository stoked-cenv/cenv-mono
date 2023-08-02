import { CenvLog, colors } from './log';
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
} from './aws/iam';
import { Package, PackageCmd } from './package/package';
import { deleteFunction, getFunction } from './aws/lambda';
import {
  createApplication,
  createDeploymentStrategy,
  createEnvironment,
  deleteCenvData,
  getApplication,
  getConfigurationProfile,
  getDeploymentStrategy,
  getEnvironment,
} from './aws/appConfig';
import * as chalk from 'chalk';
import * as path from 'path';
import { CenvParams, validateOneType } from './params';
import { Environment } from './environment';
import { Export } from '@aws-sdk/client-cloudformation';
import { listExports } from './aws/cloudformation';
import { CenvFiles, cenvRoot, EnvConfig, search_sync } from './file';
import { upsertParameter } from './aws/parameterStore';
import { deleteHostedZone } from './aws/route53';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import * as child from 'child_process';
import { ProcessMode } from './package/module';
import { Deployment } from './deployment';
import { cmdInit, parseCmdParams } from './cli';
import { sleep } from './utils';
import { ioAppEnv } from './stdio';
import { execCmd } from './proc';

interface FlagValidation {
  application: string;
  environment: string;
  options: any;
  envConfig: EnvConfig;
}

interface IApplicationShiftExecutor {
  (envCtx: any, params: any, options: any): Promise<PackageCmd>;
}

export interface BaseCommandOptions {
  profile?: string;
  env?: string;
  help?: boolean;
  cli?: boolean;
  logLevel?: string;
  allowLocalPackage?: boolean;
  defaultSuite?: string;
  scopeName?: string;
  skipBuild?: boolean;
  userInterface?: boolean;
}

export interface ConfigCommandOptions extends BaseCommandOptions {
  localstackApiKey?: string;
  show?: boolean;
  key?: boolean;
}

export interface ConfigRemoveCommandOptions extends ConfigCommandOptions {
  default?: boolean;
}

export interface CleanCommandOptions extends BaseCommandOptions {
  mode?: string;
  allApplications?: boolean;
  globals?: boolean;
  environment?: string;
}

export interface CdkCommandOptions extends BaseCommandOptions {
  profile?: string;
  dependencies?: boolean;
  strictVersions?: boolean;
  cli?: boolean;
  failOnError?: boolean;
  suite?: string;
  test?: boolean;
  stack?: boolean;
  parameters?: boolean;
  docker?: boolean;
  cenv?: boolean;
}

export interface DockerCommandOptions extends BaseCommandOptions {
  build?: boolean;
  push?: boolean;
  profile?: string;
  application?: string;
  dependencies?: boolean;
  force?: boolean;
}

export interface DeployCommandOptions extends CdkCommandOptions {
  key?: boolean;
  addKeyAccount?: string;
  verify?: boolean;
  force?: boolean;
  bump: string;
}

export interface DestroyCommandOptions extends CdkCommandOptions {
  globalParameters?: boolean;
  nonGlobalParameters?: boolean;
  environment?: boolean;
  allParameters?: boolean;
  allDocker?: boolean;
  all?: boolean;
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

export interface CmdInfo {
  name: string;
  parent?: CmdInfo;
}

export interface NewCommandOptions extends BaseCommandOptions {
  template?: string;
  packagePaths?: string[];
  force?: boolean;
}

export interface InitCommandOptions extends BaseCommandOptions {
  scope?: string;
}

export interface StackProc {
  cmd: string,
  proc: child.ChildProcess
  stackName?: string
}

export class CommandInfo {
  // parsed arguments
  args: Record<string, string> = {};

  // optional command process mode
  deploymentMode?: ProcessMode = undefined;

  // command allowables
  allowUI = true;
  allowPackages = true;
  allowLocalPackage = true;

  // command prerequisites
  packagesRequired = true;
  configRequired = true;
  cenvRootRequired = true;
}

export class Cenv {
  static runningProcesses?: { [stackName: string]: StackProc[] } = {};
  static processes: { [pid: number]: StackProc } = {};
  static dashboard: any = null;
  static cleanTags: (...text: string[]) => string[];
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

  static async cenvSetup(commandName: string, cmdInfo: CommandInfo, params?: string[], options?: Record<string, any>) {
    if (!params) {
      params = [];
    }

    if (!options) {
      options = {};
    }

    Package.callbacks.cancelDependencies = Deployment.cancelDependencies.bind(Deployment);
    Cenv.cleanTags = (...text: string[]) => {
      return this.dashboard?.cleanTags(...text);
    };

    await cmdInit(options, cmdInfo);

    if (!cmdInfo.cenvRootRequired) {
      return { params, options };
    }

    if (!cmdInfo.allowUI) {
      options.cli = true;
    }
    const passThru = { skipBuild: options.skipBuild };

    const { packages, parsedParams, validatedOptions } = await parseCmdParams(params, options, cmdInfo);
    return { params: parsedParams, options: { ...validatedOptions, ...passThru }, packages, args: options?.args };
  }

  static addSpawnedProcess(stackName: string, cmd: string, proc: child.ChildProcess) {
    if (proc.pid === undefined || Cenv.processes === undefined || Cenv.runningProcesses === undefined) {
      return;
    }
    Cenv.processes[proc.pid] = { stackName, cmd, proc };

    if (!Cenv.runningProcesses[stackName]) {
      Cenv.runningProcesses[stackName] = [{ cmd, proc }];
    } else {
      Cenv.runningProcesses[stackName].push({ cmd, proc });
    }
  }

  static async env(params: string[], options: Record<string, any>) {
    if (!params.length) {
      CenvLog.info(`current environment: ${colors.infoBold(process.env.ENV)}`);
    }
    if (options.exports) {
      let exports: any = await listExports();
      if (params) {
        exports = exports.filter((e: Export) => params.includes(e.Name?.replace(`${process.env.ENV}-`, '') as string));
        exports = exports.map((e: Export) => e.Value);
        CenvLog.single.stdLog(exports.join(' '));
        return;
      }
      CenvLog.info('exports');
      const coloredLines = exports.map((e: Export) => {
        return `\t${e.Name}: ${colors.infoBold(e.Value)}`;
      });
      CenvLog.info(coloredLines.join('\n'));
      return;
    }
    const env = new Environment();
    await env.load();
    CenvLog.info('deployed');
    env.packages.map((p: Package) => CenvLog.info(`\t${p.packageName}`));
  }

  static addParam = async (pkg: Package, params: string[], options: Record<string, any>) => {
    function getAddParam(application: string) {
      return `cenv add ${application ? application + ' ' : ''}${options?.app ? '-a' : ''} ${options?.environment ? '-e' : ''} ${options?.global ? '-g' : ''} ${options?.globalEnv ? '-ge' : ''}`;
    }

    const cmd = pkg.createCmd(getAddParam(pkg.packageName));
    const type = validateOneType(Object.keys(options));
    if (!type) {
      cmd.err(`Must contain at least one type flag (${colors.infoBold('--app-type')}, ${colors.infoBold('--environment-type')}, 
        ${colors.infoBold('--global-type')}, ${colors.infoBold('--global-env-type')}`);
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
      const error = `Attempted to add key "${colors.errorBold(key)}" as ${type === 'global' ? 'a' : 'an'} "${colors.errorBold(type)}" param type, but this key already exists as ${alreadyExistingType === 'global' ? 'a' : 'an'} "${colors.errorBold(alreadyExistingType)}" param`;
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
      cmd.out(`deploying ${colors.infoBold(config.ApplicationName)} configuration to environment ${chalk.blueBright(config.EnvironmentName)}`);
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
      const pkg = Package.fromPackageName(envConfig.ApplicationName);
      await Promise.all(lines.map(async (line: string) => {
        const keyValue = line.split('=');
        if (keyValue.length === 2) {
          const key = keyValue[0].trim();
          const value = keyValue[1].trim();
          if (key.length > 1 && value.length > 1) {
            await Cenv.addParam(pkg, [key, value], { appType: true });
          }
        }
      }));
    }
  }

  static async initParams(options?: ParamsCommandOptions, tags: string[] = []) {
    try {
      const flagValidateResponse = this.initFlagValidation(options);

      let { application, environment, envConfig } = flagValidateResponse;
      options = flagValidateResponse.options;

      if (!(await this.verifyCenv())) {
        await this.deployCenv();
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

      if (options?.envToParams) {
        await this.envToParams(envConfig);
      }
    } catch (err) {
      CenvLog.single.catchLog('Cenv.init err: ' + (err instanceof Error ? err.stack : err));
    }
  }

  public static async destroyAppConfig(application: string, options: Record<string, any>) {
    await deleteCenvData(application, options?.parameters || options?.all, options?.config || options?.all, options?.all || options?.global);
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
        componentsMissing.push(['Materialization Lambda', 'cenv-params']);
      }
      if (!silent) {
        if (!verified) {
          CenvLog.info(`cenv failed validation with the following missing components:`);
          componentsMissing.map((component) => CenvLog.info(` - ${component[0]} (${colors.infoBold(component[1])})`));
        } else {
          CenvLog.info('cenv www has been verified');
        }
      }
      //const res = verified ? 0 : 1;
      //await cmd?.result(res);
      return verified;
    } catch (e) {
      CenvLog.single.catchLog(e);
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
          }],
                                                                         }));
      }

      const roleExists = await getRole(this.roleName);
      if (!roleExists) {
        const roleRes = await createRole(this.roleName, JSON.stringify({
                                                                         Version: '2012-10-17', Statement: [{
            Effect: 'Allow', Principal: {
              Service: 'lambda.amazonaws.com',
            }, Action: 'sts:AssumeRole',
          }],
                                                                       }));
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
              Action: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
              Resource: process.env.KMS_KEY,
            }],
                                                                        }));

          if (!polRes) {
            return;
          }
        }

        const group = await createGroup(this.keyGroupName);
        const attRes = await attachPolicyToGroup(this.keyGroupName, 'KmsPolicy', KmsPolicyArn);
        const groupUser = await addUserToGroup(this.keyGroupName, process.env.AWS_ACCOUNT_USER_ARN!.split('/')[1]);

        const polRes = await attachPolicyToRole(this.roleName, KmsPolicyArn);
        if (!polRes) {
          return;
        }
      }

      let polAttRes = await attachPolicyToRole(this.roleName, 'arn:aws:iam::aws:policy/AmazonSSMFullAccess');
      if (!polAttRes) {
        return;
      }

      polAttRes = await attachPolicyToRole(this.roleName, AppConfigGetArn);
      if (!polAttRes) {
        return;
      }

      polAttRes = await attachPolicyToRole(this.roleName, 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole');
      if (!polAttRes) {
        return;
      }

      CenvLog.single.infoLog(`sleep for 8 seconds because if we try to use the role we just created too soon it will fail ${colors.infoBold('🙄')}`);
      await sleep(8);
      // iam client => waitUntilRoleExists

      const materializationExists = await getFunction('cenv-params');
      if (!materializationExists) {
        await this.createParamsLibrary();
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

  public static Clean(startPath: string = cenvRoot, options?: CleanCommandOptions) {
    CenvFiles.clean(startPath, options as Record<string, any>);
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
    return { application: options?.application, environment: envConfig.EnvironmentName, options, envConfig };
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
    const confProf = await getConfigurationProfile(envConfig.ApplicationId, 'config');

    if (!confProf || !confProf.ConfigurationProfileId) {
      return false;
    }
    envConfig.ConfigurationProfileId = confProf.ConfigurationProfileId;
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
      await CenvParams.push(options?.stack);
    }
  }

  private static async createParamsLibrary() {

    if (!existsSync(CenvFiles.GIT_TEMP_PATH)) {
      mkdirSync(CenvFiles.GIT_TEMP_PATH);
    }

    const libPathModule = CenvFiles.GIT_TEMP_PATH + '/node_modules/@stoked-cenv/lib';
    if (!existsSync(libPathModule)) {
      mkdirSync(libPathModule, { recursive: true });
    }

    const libPath = path.join(__dirname, '../');
    const pkg = '/package.json';
    const tsconfig = '/tsconfig.json';
    const index = '/index.ts';

    cpSync(libPath + 'dist', libPathModule, { recursive: true });
    copyFileSync(libPath + tsconfig, libPathModule + tsconfig);
    const pkgMeta = require(libPath + 'package.json');
    delete pkgMeta.dependencies['stoked-cenv'];
    writeFileSync(libPathModule + pkg, JSON.stringify(pkgMeta, null, 2));
    const paramsPath = path.join(__dirname, '../params');
    copyFileSync(paramsPath + pkg + '.build', CenvFiles.GIT_TEMP_PATH + pkg);
    copyFileSync(paramsPath + tsconfig + '.build', CenvFiles.GIT_TEMP_PATH + tsconfig);
    copyFileSync(paramsPath + index + '.build', CenvFiles.GIT_TEMP_PATH + index);

    await execCmd('npm i', { path: libPathModule });
    await execCmd('npm i', { path: CenvFiles.GIT_TEMP_PATH });
    await execCmd('tsc', { path: CenvFiles.GIT_TEMP_PATH });

    await execCmd(`zip -r materializationLambda.zip * > zip.log`, { path: CenvFiles.GIT_TEMP_PATH });
    return path.join(CenvFiles.GIT_TEMP_PATH, `materializationLambda.zip`);
  }
}
