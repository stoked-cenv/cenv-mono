import { CenvLog } from './log';
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
import { createFunction, deleteFunction, getFunction } from './aws/lambda';
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
  hard?: boolean;
}

export interface ParamsCommandOptions extends BaseCommandOptions {
  stage?: string;
  diff?: boolean;
  typed?: boolean;
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

    // create global package
    Package.global;

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
      CenvLog.info(`current environment: ${CenvLog.colors.infoBold(CenvFiles.ENVIRONMENT)}`);
    }
    if (options.exports) {
      let exports: any = await listExports();
      if (params) {
        exports = exports.filter((e: Export) => params.includes(e.Name?.replace(`${CenvFiles.ENVIRONMENT}-`, '') as string));
        exports = exports.map((e: Export) => e.Value);
        CenvLog.single.stdLog(exports.join(' '));
        return;
      }
      CenvLog.info('exports');
      const coloredLines = exports.map((e: Export) => {
        return `\t${e.Name}: ${CenvLog.colors.infoBold(e.Value)}`;
      });
      CenvLog.info(coloredLines.join('\n'));
      return;
    }
    const env = new Environment();
    await env.load();
    CenvLog.info('deployed');
    env.packages.map((p: Package) => CenvLog.info(`\t${p.packageName}`));
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
          componentsMissing.map((component) => CenvLog.info(` - ${component[0]} (${CenvLog.colors.infoBold(component[1])})`));
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

      //CenvLog.single.infoLog(`sleep for 8 seconds because if we try to use the role we just created too soon it will fail ${CenvLog.colors.infoBold('🙄')}`);
      await sleep(8);
      // iam client => waitUntilRoleExists

      const materializationExists = await getFunction('cenv-params');
      if (!materializationExists) {
        const cenvParamsZip = await CenvParams.createParamsLibrary();
        await createFunction('cenv-params', cenvParamsZip, roleArn, {}, {  ApplicationName: '@stoked-cenv/params',EnvironmentName: CenvFiles.ENVIRONMENT })
        //const materializationRes = await createLambdaApi('cenv-params', handler, roleArn,{},{  ApplicationName: '@stoked-cenv/params',EnvironmentName: CenvFiles.ENVIRONMENT },);
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

      if (CenvFiles.ENVIRONMENT === 'local') {
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

}
