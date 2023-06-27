import {CenvLog, errorBold, infoBold} from './log'
import {
  createPolicy,
  createRole,
  createGroup,
  addUserToGroup,
  attachPolicyToGroup,
  attachPolicyToRole,
  getPolicy,
  getRole,
  detachPolicyFromRole,
  deleteRole,
  deleteGroup, deletePolicy,
} from './aws/iam'
import {Package, PackageCmd,} from './package/package'
import {createFunction, deleteFunction, getFunction} from './aws/lambda'
import {
  createEnvironment,
  createDeploymentStrategy,
  getConfigParams,
  getDeploymentStrategy,
  getEnvironment,
  createApplication,
  getApplication,
  getConfigurationProfile,
  createConfigurationProfile, deleteCenvData
} from './aws/appConfig'
import chalk from 'chalk';
import path from 'path';
import {BaseCommandOptions, CenvParams, validateOneType} from './params';
import { Deployment } from './deployment';
import { Environment,  } from './environment';
import { Export } from '@aws-sdk/client-cloudformation';
import {listExports} from "./aws/cloudformation";
import {CenvFiles} from "./file";
import {upsertParameter} from "./aws/parameterStore";
import {execCmd, exitWithoutTags, search_sync} from "./utils";
import {ioAppEnv, ioYesOrNo} from "./stdIo";
import {deleteHostedZone} from "./aws/route53";

interface FlagValidation {
  application: string;
  environment: string;
  options: ParamsCommandOptions;
  envConfig;
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
}

export class Cenv {
  static async env(params, options) {
    if (!params.length) {
      CenvLog.info(
        `current environment: ${infoBold(process.env.ENV)}`,
      );
    }
    if (options.exports) {
      let exports: any = await listExports();
      if (params) {
        exports = exports.filter((e: Export) =>
          params.includes(e.Name.replace(`${process.env.ENV}-`, '')),
        );
        exports = exports.map((e) => e.Value);
        CenvLog.single.stdLog(exports.join(' '));
        return;
      }
      CenvLog.info('exports');
      const coloredLines = exports.map((e) => {
        return `\t${e.Name}: ${infoBold(e.Value)}`;
      });
      CenvLog.info(coloredLines.join('\n'));
      return;
    }
    const env = new Environment();
    await env.load();
    CenvLog.info('deployed');
    env.packages.map((p: Package) =>
      CenvLog.info(`\t${p.packageName}`),
    );
  }

  static addParam = async (
    pkg: Package,
    params,
    options,
  ) => {
    function getAddParam(application = undefined) {
      return `cenv add ${application ? application + ' ' : ''}${
        options?.app ? '-a' : ''
      } ${options?.environment ? '-e' : ''} ${options?.global ? '-g' : ''} ${
        options?.globalEnv ? '-ge' : ''
      }`;
    }
    const cmd = pkg.createCmd(getAddParam());
    const type = validateOneType(Object.keys(options));
    if (!type) {
      cmd.err(
        `Must contain at least one type flag (${infoBold('--app')}, ${infoBold(
          '--environment',
        )}, ${infoBold('--global')}, ${infoBold('--globalEnv')}`,
      );
      cmd.result(2);
      return cmd;
    }
    let value = null;
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
    const ctx: any = await CenvParams.getContext();
    const config = ctx.EnvConfig;
    const key = params[0].toLowerCase().replace(/_/g, '/');
    const keyPath = CenvParams.GetRootPath(
      ctx.EnvConfig.ApplicationName,
      ctx.EnvConfig.EnvironmentName,
      type,
    );
    const alreadyExistingType = await CenvFiles.KeyExists(key, keyPath, type);
    if (alreadyExistingType) {
      const error = `Attempted to add key "${errorBold(key)}" as ${
        type === 'global' ? 'a' : 'an'
      } "${errorBold(type)}" param type, but this key already exists as ${
        alreadyExistingType === 'global' ? 'a' : 'an'
      } "${errorBold(alreadyExistingType)}" param`;
      cmd.err(error);
      cmd.result(4);
      return cmd;
    }

    const parameter = await CenvFiles.createParameter(
      config,
      key,
      value,
      type,
      options.decrypted,
    );
    const res = await upsertParameter(config, parameter, type);
    await new Promise((r) => setTimeout(r, 2000));
    if (res !== 'SKIPPED') {
      await new Promise((r) => setTimeout(r, 2000));
      await CenvParams.pull(false, false, false);
    }
    if (options?.stack) {
      cmd.out(
        `deploying ${infoBold(
          config.ApplicationName,
        )} configuration to environment ${chalk.blueBright(
          config.EnvironmentName,
        )}`,
      );
      await CenvParams.Materialize();
    }
    cmd.out('success');
    cmd.result(0);
    return cmd;
  };

  static async getCenvConfig() {
    const config = await getConfigParams('cenv', 'default', 'config');
    const strat = await getDeploymentStrategy();
    return {
      ApplicationId: config.ApplicationId,
      EnvironmentId: config.EnvironmentId,
      ConfigurationProfileId: config.ConfigurationProfileId,
      DeploymentStrategyId: strat.DeploymentStrategyId,
      ApplicationName: 'cenv',
      EnvironmentName: 'default',
    };
  }

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

  private static initFlagValidation(options, tags): FlagValidation | undefined {
    if (options?.environment) {
      process.env.ENV = options.environment;
    }
    if (options?.stack && options?.push) {
      CenvLog.single.alertLog(
        'The --push is redundant. It is implied when used with --deploy',
      );
    } else if (options?.stack) {
      options.push = true;
    }

    const envConfig = CenvFiles.GetConfig(
      options?.environment || process.env.ENV,
    );
    const { application, environment } = options;

    if (
      !options?.destroy &&
      !options?.clean &&
      envConfig &&
      envConfig?.ApplicationId &&
      application &&
      envConfig.ApplicationName !== application
    ) {
      CenvLog.single.errorLog(
        'Must use --destroy or --clean with an existing config if --application is used',
      );
      process.exit(0);
    }

    exitWithoutTags(tags);
    return { application, environment, options, envConfig };
  }

  private static async processApplicationEnvironmentNames(
    options,
    application,
    environment,
    envConfig,
  ) {
    const pkgPath = search_sync(process.cwd(), true);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require(pkgPath[0].toString());

    if (!environment && process.env.ENV) {
      environment = process.env.ENV;
    }

    if (!application || !environment || options?.force) {
      const appEntry = { value: application, defaultValue: pkg.name };
      const envEntry = { value: environment, defaultValue: 'local' };
      const ioAppEnvRes = await ioAppEnv(
        envConfig,
        appEntry,
        envEntry,
        options?.force,
        options?.defaults,
      );
      if (!ioAppEnvRes) {
        return;
      }
      application = ioAppEnvRes.application;
      environment = ioAppEnvRes.environment;
    }

    if (
      envConfig?.ApplicationName !== undefined &&
      application !== undefined &&
      envConfig?.ApplicationName !== application &&
      !options?.force
    ) {
      const destroyIt = await ioYesOrNo(
        `The service has previously been configured with the application name ${envConfig?.ApplicationName}. Would you like to destroy the previously configured application, all of it's related resources, as well as the local configuration?`,
      );
      if (destroyIt) {
        await Deployment.destroyNonStack(
          pkg,
          true,
          true,
          true,
        );
      }
      return { application, environment };
    }
    return { application, environment };
  }

  private static async processApplication(application, environment) {
    let createdApp = false;
    const envConfig: any = {};
    const appRes = await getApplication(application, true);
    envConfig.ApplicationName = application;
    envConfig.EnvironmentName = environment;
    if (!appRes) {
      createdApp = true;
      const app = await createApplication(application);
      envConfig.ApplicationId = app.Id;

      const parameter = await CenvFiles.createParameter(
        envConfig,
        'application/name',
        application,
        'app',
        false,
      );
      const res = await upsertParameter(envConfig, parameter, 'app');
    } else {
      envConfig.ApplicationId = appRes.ApplicationId;
    }
    return { createdApp, envConfig };
  }

  private static async processEnvironment(envConfig, application, environment) {
    let createdEnv = false;
    envConfig.EnvironmentName = environment;
    const existingEnv = await getEnvironment(
      envConfig.ApplicationId,
      environment,
      true,
    );

    if (!existingEnv) {
      createdEnv = true;
      const env = await createEnvironment(envConfig.ApplicationId, environment);
      envConfig.EnvironmentId = env.Id;

      const parameter = await CenvFiles.createParameter(
        envConfig,
        'environment/name',
        environment,
        'globalEnv',
        false,
      );
      const res = await upsertParameter(envConfig, parameter, 'globalEnv');
    } else {
      envConfig.EnvironmentId = existingEnv.EnvironmentId;
    }
    return { createdEnv, envConfig };
  }

  private static async processConfigurationProfile(envConfig) {
    const confProf = await getConfigurationProfile(
      envConfig.ApplicationId,
      'config',
    );

    if (!confProf) {
      const confProf = await createConfigurationProfile(
        envConfig.ApplicationId,
        'config',
      );
      envConfig.ConfigurationProfileId = confProf.Id;
    } else {
      envConfig.ConfigurationProfileId = confProf.ConfigurationProfileId;
    }
    const deploymentStratRes = await getDeploymentStrategy();
    envConfig.DeploymentStrategyId = deploymentStratRes.DeploymentStrategyId;
    return envConfig;
  }

  private static async processInitData(envConfig, options) {
    CenvLog.info(
      `${envConfig.ApplicationName}:${envConfig.EnvironmentName} - saving local files`,
    );
    CenvFiles.SaveEnvConfig(envConfig);

    if (!options?.push && !options?.stack) {
      await CenvParams.pull(false, false, true, true);
    }

    if (options?.push) {
      await CenvParams.push(options?.stack);
    }
  }

  static async initParams(options?: ParamsCommandOptions, tags: string[] = []) {
    try {
      const flagValidateResponse = this.initFlagValidation(options, tags);
      let { application, environment, envConfig } = flagValidateResponse;
      options = flagValidateResponse.options;

      if (!(await this.verifyCenv())) {
        await this.deployCenv();
      }

      const appEnvNameRes = await this.processApplicationEnvironmentNames(
        options,
        application,
        environment,
        envConfig,
      );
      application = appEnvNameRes.application;
      environment = appEnvNameRes.environment;

      const processAppRes = await this.processApplication(
        application,
        environment,
      );
      envConfig = processAppRes.envConfig;
      const createdApp = processAppRes.createdApp;

      const processEnvRes = await this.processEnvironment(
        envConfig,
        application,
        environment,
      );
      envConfig = processEnvRes.envConfig;
      const createdEnv = processEnvRes.createdEnv;

      envConfig = await this.processConfigurationProfile(envConfig);

      await this.processInitData(envConfig, options);
    } catch (err) {
      CenvLog.single.catchLog(
        'Cenv.init err: ' + (err.stack ? err.stack : err),
      );
    }
  }

  public static async destroyAppConfig(application, options) {
    await deleteCenvData(
      application,
      options?.parameters || options?.all,
      options?.config || options?.all,
      options?.all || options?.global,
    );
    return true;
  }

  static materializationPkg = '@stoked-cenv/cenv-params';

  static roleName = 'LambdaConfigRole';
  static policySsmFullAccessArn = 'arn:aws:iam::aws:policy/AmazonSSMFullAccess';
  static policyLambdaBasic =
    'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole';
  static keyGroupName = 'key-users';


  static async verifyCenv(silent = true) {
    try {
      // const cmd = mat.createCmd('cenv deploy --verify');
      const AppConfigGetArn = `arn:aws:iam::${process.env.CDK_DEFAULT_ACCOUNT}:policy/AppConfigGod`;
      const KmsPolicyArn = `arn:aws:iam::${process.env.CDK_DEFAULT_ACCOUNT}:policy/KmsPolicy`;

      const componentsMissing = [];
      let verified = true;
      const depStratRes = await getDeploymentStrategy();
      if (!depStratRes.DeploymentStrategyId) {
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
        componentsMissing.push([
          'Materialization Lambda',
          'cenv-params',
        ]);
      }
      if (!silent) {
        if (!verified) {
          CenvLog.info(
              `cenv failed validation with the following missing components:`,
          );
          componentsMissing.map((component) =>
              CenvLog.info(
                  ` - ${component[0]} (${infoBold(component[1])})`,
              ),
          );
        } else {
          CenvLog.info('cenv installation has been verified');
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
      if (!depStratRes.DeploymentStrategyId) {
        await createDeploymentStrategy();
      }
      const policyExists = await getPolicy(AppConfigGetArn);
      if (!policyExists) {
        const polRes = await createPolicy(
          'AppConfigGod',
          JSON.stringify({
            Version: '2012-10-17',
            Statement: [
              {
                Action: 'appconfig:*',
                Resource: '*',
                Effect: 'Allow',
              },
              {
                Action: 'lambda:*',
                Resource: '*',
                Effect: 'Allow',
              },
            ],
          }),
        );
      }

      const roleExists = await getRole(this.roleName);
      if (!roleExists) {
        const roleRes = await createRole(
          this.roleName,
          JSON.stringify({
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Principal: {
                  Service: 'lambda.amazonaws.com',
                },
                Action: 'sts:AssumeRole',
              },
            ],
          }),
        );
        if (!roleRes) {
          return;
        }
      }

      if (process.env.KMS_KEY) {
        const KmsPolicyExists = await getPolicy(KmsPolicyArn);
        if (!KmsPolicyExists) {
          const polRes = await createPolicy(
            'KmsPolicy',
            JSON.stringify({
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Action: [
                    'kms:Encrypt',
                    'kms:Decrypt',
                    'kms:ReEncrypt*',
                    'kms:GenerateDataKey*',
                    'kms:DescribeKey',
                  ],
                  Resource: process.env.KMS_KEY,
                },
              ],
            }),
          );

          if (!polRes) {
            return;
          }
        }

        const group = await createGroup(this.keyGroupName);
        const attRes = await attachPolicyToGroup(
          this.keyGroupName,
          'KmsPolicy',
          KmsPolicyArn,
        );
        const groupUser = await addUserToGroup(
          this.keyGroupName,
          process.env.AWS_ACCOUNT_USER_ARN.split('/')[1],
        );

        const polRes = await attachPolicyToRole(this.roleName, KmsPolicyArn);
        if (!polRes) {
          return;
        }
      }

      let polAttRes = await attachPolicyToRole(
        this.roleName,
        'arn:aws:iam::aws:policy/AmazonSSMFullAccess',
      );
      if (!polAttRes) {
        return;
      }

      polAttRes = await attachPolicyToRole(this.roleName, AppConfigGetArn);
      if (!polAttRes) {
        return;
      }

      polAttRes = await attachPolicyToRole(
        this.roleName,
        'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
      );
      if (!polAttRes) {
        return;
      }

      // should be able to skip this because i reordered the building of the lambdas to fill in this time slot
      //infoLog(`sleep for 10 seconds because if we try to use the role we just created too soon it will fail ${infoBold('🙄')}`);
      //await sleep(2);

      const materializationExists = await getFunction('cenv-params');

      const pkgPath = path.join(__dirname, '../../lib/params');

      if (!materializationExists) {
        await execCmd(
          pkgPath,
          'yarn run build',
          'build materialization artifacts',
        );

        const materializationRes = await createFunction(
          'cenv-params',
          path.join(pkgPath, '/materializationLambda.zip'),
          roleArn,
          {},
          {
            ApplicationName: '@stoked-cenv/cenv',
            EnvironmentName: process.env.ENV,
          },
        );
      }
    } catch (e) {
      CenvLog.single.catchLog(
        'Cenv.deployCenv err: ' + (e.stack ? e.stack : e),
      );
    }
  }

  static async destroyCenv(): Promise<boolean> {
    let destroyedAnything = false;
    try {


      //const cmd = mat.createCmd('cenv destroy -cenv');

      const KmsPolicyArn = `arn:aws:iam::${process.env.CDK_DEFAULT_ACCOUNT}:policy/KmsPolicy`;
      const AppConfigGetArn = `arn:aws:iam::${process.env.CDK_DEFAULT_ACCOUNT}:policy/AppConfigGod`;

      const materializationExists = await getFunction('cenv-params');
      if (materializationExists) {
        destroyedAnything = true;
        const materializationRes = await deleteFunction('cenv-params');
        if (!materializationRes) return;
      }

      const roleExists = await getRole(this.roleName);
      if (roleExists) {
        destroyedAnything = true;
        await detachPolicyFromRole(this.roleName, this.policyLambdaBasic);
        await detachPolicyFromRole(this.roleName, this.policySsmFullAccessArn);
        await detachPolicyFromRole(this.roleName, AppConfigGetArn);
        await detachPolicyFromRole(this.roleName, KmsPolicyArn);
        const roleRes = await deleteRole(this.roleName);
        if (!roleRes) {
          return;
        }
      }

      if (process.env.KMS_KEY) {
        const groupDelRes = await deleteGroup(this.keyGroupName, false);

        const KmsPolicyExists = await getPolicy(KmsPolicyArn);
        if (KmsPolicyExists) {
          destroyedAnything = true;
          const polRes = await deletePolicy(KmsPolicyArn);
          if (!polRes) {
            return;
          }
        }
      }
      const policyExists = await getPolicy(AppConfigGetArn);
      if (policyExists) {
        destroyedAnything = true;
        const polRes = await deletePolicy(AppConfigGetArn);
      }

      if (process.env.ENV === 'local') {
        destroyedAnything = true;
        await deleteHostedZone(process.env.ROOT_DOMAIN);
      }

    } catch (e) {
      CenvLog.single.catchLog(
        'Cenv.destroyCenv err: ' + (e.stack ? e.stack : e),
      );
    }
    return destroyedAnything;
  }

  static BumpChanged() {
    const packages = Object.values(Package.cache);
    const changed = packages.filter((p: Package) => p.hasChanged());
  }
}
