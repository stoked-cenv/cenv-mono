import {createConfigurationProfile, deleteCenvData, deployConfig, getDeploymentStrategy} from './aws/appConfig';
import { stripPath } from './aws/parameterStore';
import { updateLambdas } from './aws/lambda';
import { CenvLog } from './log';

import { expandTemplateVars } from './utils';
import {CenvFiles, CenvVars, IParameter} from './file';
import { cpSync } from 'fs';
import { Package } from './package/package';
import { Environment } from './environment';
import { ProcessMode } from './package/module';
import { Cenv } from './cenv';
import path from 'path';
import { execCmd } from './proc';
import { ParamsModule } from './package/params';

interface Parameters {
  [key: string]: IParameter;
}

interface ParameterSet {
  app: Parameters;
  environment: Parameters;
  global: Parameters;
  globalEnv: Parameters;
}

export const variableTypes = ['app', 'environment', 'global', 'globalEnv'];

export function filteredCount(options: string[], types: string[]) {
  const filtered = options.filter(el => {
    return types.indexOf(el.replace('Type', '')) > -1;
  });
  return filtered;
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
  before?: { [x: string]: string; },
  after?: { [x: string]: string; },
  error?: Error
}

export const collapseParams = (params: CenvVars) => {
  return { ...params.global, ...params.globalEnv, ...params.environment, ...params.app };
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

type VarTypes = 'app' | 'environment' | 'globalEnv' | 'global';

export interface IRootPaths {
  app: string,
  globalLink: string,
  global: string,
  globalEnvLink: string,
  globalEnv: string,
  environment: string,
  generate: string
}

export class CenvParams {

  static async getParamsContext() {
    const packageName = Package.getPackageName();
    const pkg = await Package.fromPackageName(packageName);
    if (pkg.params?.hasCenvVars) {
      const envCtx: any = await CenvFiles.GetData(packageName);
      if (!envCtx || !envCtx.EnvConfig) {
        process.exit(0);
      }
      envCtx.pkg = pkg;
      return envCtx;
    }
    return { pkg };
  }

  public static GetRootPath(ApplicationName: string, EnvironmentName: string, type: string): string {
    const paths: any = this.GetRootPaths(ApplicationName, EnvironmentName);
    return paths[type];
  }

  public static GetRootPaths(ApplicationName: string, EnvironmentName: string): IRootPaths {
    const app = stripPath(ApplicationName);
    const env = stripPath(EnvironmentName);
    return {
      app: stripPath(`/service/${app}/app`), globalLink: stripPath(`/service/${app}/global`), global: stripPath(`/global`), globalEnvLink: stripPath(`/service/${app}/globalenv/${env}`), globalEnv: stripPath(`/globalenv/${env}`), environment: stripPath(`/service/${app}/environment/${env}`), generate: stripPath(`/service/${app}/generate`),
    };
  }

  static getMaterializedMeta(materializedVars: Record<string, string>, typed: Record<VarTypes, Record<string, string>>) {
    const from: Record<string, string> = {};
    for (const [key, value] of Object.entries(materializedVars) as [string, string][]) {
      if (typed['app'] && typed['app'][key] !== undefined) {
        from[key] = 'app';
      } else if (typed['environment'] && typed['environment'][key] !== undefined) {
        from[key] = 'environment';
      } else if (typed['globalEnv'] && typed['globalEnv'][key] !== undefined) {
        from[key] = 'globalEnv';
      } else if (typed['global'] && typed['global'][key] !== undefined) {
        from[key] = 'global';
      }
    }
    return from;
  }

  public static AllTyped(paramSet: ParameterSet) {
    return {
      app: (this.encodeParameters(paramSet.app)), environment: (this.encodeParameters(paramSet.environment)), global: (this.encodeParameters(paramSet.global)), globalEnv: (this.encodeParameters(paramSet.globalEnv)),
    };
  }

  public static async MaterializeCore(event: any = undefined): Promise<LambdaProcessResponse> {
    try {
      const {
        ApplicationId,
        EnvironmentId,
        ConfigurationProfileId,
        ApplicationName,
        EnvironmentName,
        MetaConfigurationProfileId,
      } = event;

      if (!CenvFiles.ENVIRONMENT) {
        CenvFiles.ENVIRONMENT = EnvironmentName;
      }

      if (!ApplicationName || !EnvironmentName || !ApplicationId || !EnvironmentId || !ConfigurationProfileId) {
        console.log('Missing required parameters in event');
        return { error: new Error('Materialization Failed: Missing required parameters in event') };
      }

      const depStratRes = await getDeploymentStrategy();
      if (!depStratRes) {
        return { error: new Error('Materialization Failed: Deployment strategy does not exist.') };
      }
      const appConfig = {
        ApplicationId, EnvironmentId, ConfigurationProfileId, ApplicationName, EnvironmentName, DeploymentStrategyId: depStratRes.DeploymentStrategyId
      };

      const appConfigMeta = {
        ApplicationId, EnvironmentId, ConfigurationProfileId: MetaConfigurationProfileId, ApplicationName, EnvironmentName,DeploymentStrategyId: depStratRes.DeploymentStrategyId
      };
      if (!appConfigMeta.ConfigurationProfileId) {
        const metaCreateRes = await createConfigurationProfile(ApplicationId);
        if (metaCreateRes) {
          appConfigMeta.ConfigurationProfileId = metaCreateRes.MetaId;
        }
      }
      if (process.env.VERBOSE_LOGS) {
        console.log('appConfig', appConfig);
        console.log('appConfigMeta', appConfigMeta);
      }
      // materialize the new app vars from the parameter store using the app config as input
      const parameters = await ParamsModule.getParams(ApplicationName, 'allTyped', 'simple', false, false, true);
      if (process.env.VERBOSE_LOGS) {
        console.log('parameters', JSON.stringify(parameters, null, 2));
      }
      let materializedVars = collapseParams(parameters);

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
        const materializedMeta = this.getMaterializedMeta(materializedVars, parameters);
        await deployConfig(materializedMeta, appConfigMeta);
      }
      if (!before && !after) {
        return { error: new Error('Materialization Failed: No parameters found.') };
      }
      return { before, after };
    } catch (e) {
      CenvLog.single.errorLog('Cenv.MaterializeCore err: ' + e as string);
      return { error: e ? new Error(e.toString()) : new Error("Materialization Failed: unknown error") };
    }
  }

  public static async destroyAppConfig(application: string, options: Record<string, any>) {
    await deleteCenvData(application, options?.parameters || options?.all, options?.config || options?.all, options?.all || options?.global);
    return true;
  }

  public static async createParamsLibrary() {

    const cenvParamsPath = path.join(CenvFiles.ARTIFACTS_PATH, 'cenvParams');
    const cenvLibDepPath = path.join(cenvParamsPath, 'node_modules', '@stoked-cenv', 'lib');
    CenvFiles.freshPath(cenvParamsPath);
    const paramsPath = path.join(__dirname, '../params');
    const libPath = path.join(__dirname, '../../../dist/lib');
    cpSync(paramsPath, cenvParamsPath, { recursive: true, dereference: true });
    await execCmd('npm i', { path: cenvParamsPath });
    cpSync(libPath, cenvLibDepPath, { recursive: true, dereference: true });
    await execCmd('tsc', { path: cenvParamsPath });
    await execCmd(`zip -r materializationLambda.zip * > ../zip.log`, { path: cenvParamsPath });
    return path.join(cenvParamsPath, `materializationLambda.zip`);
  }

  private static encodeParameter(parameter: IParameter) {
    return parameter.Value ? parameter.Value : parameter;
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

}

