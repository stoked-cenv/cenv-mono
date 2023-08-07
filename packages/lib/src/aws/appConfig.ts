import {
  AppConfigClient,
  Application,
  ConfigurationProfileSummary,
  CreateApplicationCommand,
  CreateConfigurationProfileCommand,
  CreateDeploymentStrategyCommand,
  CreateEnvironmentCommand,
  CreateHostedConfigurationVersionCommand,
  DeleteApplicationCommand,
  DeleteConfigurationProfileCommand,
  DeleteEnvironmentCommand,
  DeleteHostedConfigurationVersionCommand,
  Environment,
  ListApplicationsCommand,
  ListConfigurationProfilesCommand,
  ListDeploymentStrategiesCommand,
  ListEnvironmentsCommand,
  ListHostedConfigurationVersionsCommand,
  StartDeploymentCommand,
} from '@aws-sdk/client-appconfig';
import * as yaml from 'js-yaml';
import {deleteParametersByPath, stripPath} from './parameterStore';
import {CenvLog} from '../log';
import {isString} from '../utils';
import {CenvFiles, EnvConfig} from '../file';

let _client: AppConfigClient;

function getClient() {
  if (_client) {
    return _client;
  }
  const {AWS_REGION, AWS_ENDPOINT} = process.env;

  _client = new AppConfigClient({
                                  region: AWS_REGION, endpoint: AWS_ENDPOINT
                                });
  return _client;
}

export async function createApplication(name: string): Promise<any> {
  const res = await getApplication(name, undefined, false);
  if (res) {
    return {Id: res.ApplicationId, exists: true};
  }
  const createAppParams = {
    Name: name
  }
  const command = new CreateApplicationCommand(createAppParams);
  try {
    return await getClient().send(command);
  } catch (e) {
    CenvLog.single.errorLog(['CreateApplicationCommand error', e as string]);
    return null;
  }
}

export async function createEnvironment(applicationId: string, name: string): Promise<any> {
  const response = await getEnvironment(applicationId, name, true);
  if (response) {
    return {Id: response.EnvironmentId, exists: true};
  }
  const createEnvParams = {
    ApplicationId: applicationId, Name: name
  }
  const command = new CreateEnvironmentCommand(createEnvParams);
  try {
    const response = await getClient().send(command);

    return response;
  } catch (e) {
    CenvLog.single.errorLog(['CreateEnvironmentCommand error', e as string])
    return null;
  }
}

async function createConfProfileBase(applicationId: string, name: string) {
  const createConfigProfileParams = {
    ApplicationId: applicationId, Name: name, LocationUri: 'hosted'
  }
  const command = new CreateConfigurationProfileCommand(createConfigProfileParams);
  const response = await getClient().send(command);
  if (response && response.Id) {
    return response.Id
  }
  return false;
}

export async function createConfigurationProfile(applicationId: string, name = 'config'): Promise<{ Id: string, MetaId: string, Name: string, Existed: boolean } | false> {
  try {
    const responseConf = await getConfigurationProfile(applicationId, name);
    if (responseConf && responseConf.ConfigurationProfileId) {
      const res: any = {Id: responseConf.ConfigurationProfileId, Name: name, Existed: true};
      if (!responseConf?.MetaConfigurationProfileId) {
        const metaConfigId = await createConfProfileBase(applicationId, name + '_meta');
        if (metaConfigId) {
          res.MetaId = metaConfigId
        }
      }
      return res;
    }

    const configId = await createConfProfileBase(applicationId, name);
    if (configId) {
      const metaConfigId = await createConfProfileBase(applicationId, name + '_meta');
      if (metaConfigId) {
        return { Id: configId, MetaId: metaConfigId, Name: name, Existed: false };
      }
    }
    return false;
  } catch (e) {
    CenvLog.single.errorLog(['CreateConfigurationProfileCommand error', e as string])
  }
  return false;
}

export async function createHostedConfigurationVersion(ApplicationId: string, ConfigurationProfileId: string, content: any): Promise<any> {
  try {
    const enc = new TextEncoder();
    const awsFormat = enc.encode(content);

    const createHostedConfigParams = {
      ApplicationId, ConfigurationProfileId, Content: awsFormat, ContentType: 'application/x-yaml',
    }

    const cmdHostedConfig = new CreateHostedConfigurationVersionCommand(createHostedConfigParams);
    const res = await getClient().send(cmdHostedConfig);
    return res;
  } catch (e) {
    CenvLog.single.errorLog(['CreateHostedConfigurationVersionCommand error', e as string])
    return null;
  }
}

export async function createDeploymentStrategy(name = 'Instant.AllAtOnce', deploymentDurationInMinutes = 0, growthFactor = 100, growthType = 'LINEAR', finalBakeTimeInMinutes = 0, replicateTo = 'NONE'): Promise<any> {

  const createDepParams = {
    Name: name,
    DeploymentDurationInMinutes: deploymentDurationInMinutes,
    FinalBakeTimeInMinutes: finalBakeTimeInMinutes,
    GrowthFactor: growthFactor,
    GrowthType: growthType,
    ReplicateTo: replicateTo
  }
  const command = new CreateDeploymentStrategyCommand(createDepParams);
  try {
    const response = await getClient().send(command);
    return response;
  } catch (e) {
    CenvLog.single.errorLog(['createDeploymentStrategy error', e as string]);
    return null;
  }
}

export async function startDeployment(ApplicationId: string, ConfigurationProfileId: string, ConfigurationVersion: string, EnvironmentId: string, DeploymentStrategyId: string): Promise<any> {
  const startDeploymentParams = {
    ApplicationId, ConfigurationProfileId, ConfigurationVersion, EnvironmentId, DeploymentStrategyId,
  }

  const command = new StartDeploymentCommand(startDeploymentParams);
  try {
    const response = await getClient().send(command);
    return response;
  } catch (e) {
    CenvLog.single.errorLog(['StartDeploymentCommand error', e as string]);
    return null;
  }
}

export async function getDeploymentStrategy() {
  const command = new ListDeploymentStrategiesCommand({});
  const result = {DeploymentStrategyId: 'Instant.AllAtOnce'};

  try {
    const response = await getClient().send(command);
    let lookupId: string | null = null;
    if (response.Items) {
      for (let appIdx = 0; appIdx < response.Items.length; appIdx++) {
        const item = response.Items[appIdx];
        if (item.Name === 'Instant.AllAtOnce' && item.Id) {
          lookupId = item.Id;
          break;
        }
      }

    }
    if (lookupId) {
      result.DeploymentStrategyId = lookupId;
      return result;
    }
    return false;
  } catch (e) {
    CenvLog.single.errorLog(['getDeploymentStrategy error', e as string])
    return false;
  }
}

export async function listApplications(getEnvironments = false): Promise<Application[] | false> {
  const command = new ListApplicationsCommand({});

  try {
    const response = await getClient().send(command);
    const result: Application[] = response.Items ? response.Items : [];
    if (getEnvironments) {
      for (let appIdx = 0; appIdx < result.length; appIdx++) {
        const app: any = result[appIdx];
        app.Environments = await listEnvironments(app.Id);
      }
    }
    return result
  } catch (e) {
    CenvLog.single.errorLog(['listApplications error', e as string])
  }
  return false
}

export async function getEnvironmentAppConfigs() {
  const command = new ListApplicationsCommand({});

  try {
    const response = await getClient().send(command);
    const result: any = response ? response.Items : [];
    const applications: {
      [key: string]: {
        ApplicationId?: string,
        ApplicationName?: string,
        EnvironmentName?: string,
        EnvironmentId?: string,
        ConfigurationProfileId?: string,
        VersionNumber?: number
      }
    } = {};
    for (let appIdx = 0; appIdx < result.length; appIdx++) {
      const app: any = result[appIdx];

      if (!applications[app.Id]) {
        applications[app.Id] = {}
      }
      applications[app.Id].ApplicationId = app.Id;
      applications[app.Id].ApplicationName = app.Name;

      const environment = await getEnvironment(app.Id, process.env.ENV!);
      if (environment) {
        applications[app.Id].EnvironmentName = process.env.ENV;
        applications[app.Id].EnvironmentId = environment.EnvironmentId;
      }

      const configurationProfile = await getConfigurationProfile(app.Id, 'config');
      if (configurationProfile && configurationProfile.ConfigurationProfileId) {
        applications[app.Id].ConfigurationProfileId = configurationProfile.ConfigurationProfileId
      } else {
        continue;
      }

      const version = await getHostedConfigurationVersion(app.Id, configurationProfile.ConfigurationProfileId);
      if (version) {
        applications[app.Id].VersionNumber = version.VersionNumber
      }
    }
    return applications;
  } catch (e) {
    CenvLog.single.errorLog(['getEnvironmentAppConfigs error', e as string])
  }
}

export async function getApplication(applicationName: string, silent = true, environment: string | boolean = false, configurationProfile: string | boolean = false) {
  const command = new ListApplicationsCommand({});

  try {
    const response = await getClient().send(command);
    let ApplicationId: string | null = null;
    if (response.Items) {
      for (let appIdx = 0; appIdx < response.Items.length; appIdx++) {
        const app = response.Items[appIdx];
        if (app.Name === applicationName && app.Id) {
          ApplicationId = app.Id;
          if (!environment) {
            return {ApplicationId};
          }
          break;
        }
      }
    }
    if (!ApplicationId) {
      if (!silent) {
        CenvLog.single.errorLog(`application ${CenvLog.colors.errorBold(applicationName)} does not exist.`);
      }
      return false;
    }

    let EnvironmentId: string | null = null;
    if (environment) {
      if (!isString(environment)) {
        const environments = await listEnvironments(ApplicationId);
        if (!environments || environments.length === 0) {
          if (!silent) {
            CenvLog.single.errorLog(`environment ${CenvLog.colors.errorBold(environment)} does not exist`);
          }
          return false;
        }
      } else {
        const env = await getEnvironment(ApplicationId, environment as string, silent);
        if (!env) {
          if (!silent) {
            CenvLog.single.errorLog(`Environment ${CenvLog.colors.errorBold(environment)} does not exist`);
          }
        } else {
          EnvironmentId = env.EnvironmentId;
          if (!configurationProfile) {
            return {ApplicationId, EnvironmentId};
          }
        }
      }
    }
    let ConfigurationProfileId: string | null = null;
    if (configurationProfile) {
      if (!isString(configurationProfile)) {
        const configurationProfiles = await listConfigurationProfiles(ApplicationId);
        if (!configurationProfiles || configurationProfiles.length === 0) {
          if (!silent) {
            CenvLog.single.errorLog(`configuration profile ${CenvLog.colors.errorBold(configurationProfile)} has no configurations.`);
          }
          return false;
        }
      } else {
        const env = await getConfigurationProfile(ApplicationId, configurationProfile as string, silent);
        if (!env || !env.ConfigurationProfileId) {
          if (!silent) {
            CenvLog.single.errorLog(`configuration profile ${CenvLog.colors.errorBold(configurationProfile)} does not exist.`);
          }
        } else {
          ConfigurationProfileId = env.ConfigurationProfileId;
          return {ApplicationId, EnvironmentId, ConfigurationProfileId};
        }
      }
    }
    return false;
  } catch (e) {
    CenvLog.single.errorLog(['getApplication error', e as string])
    return false;
  }
}

export async function getConfig(ApplicationName: string, EnvironmentName: string = process.env.ENV!, ConfigurationProfileName = 'config', Silent = true): Promise<false | {
  config: EnvConfig,
  version?: number
}> {
  const command = new ListApplicationsCommand({});
  if (ApplicationName === undefined) {
    ApplicationName = CenvFiles.EnvConfig.ApplicationName;
  }
  if (EnvironmentName === undefined) {
    EnvironmentName = CenvFiles.EnvConfig.EnvironmentName;
  }

  try {
    const response = await getClient().send(command);
    let ApplicationId: string | null = null;
    if (response.Items) {
      for (let appIdx = 0; appIdx < response.Items.length; appIdx++) {
        const app = response.Items[appIdx];
        if (app.Name === ApplicationName && app.Id) {
          ApplicationId = app.Id;
          //infoLog([ApplicationName, ApplicationId]);
          break;
        }
      }
    }
    if (!ApplicationId) {
      if (!Silent) {
        CenvLog.single.errorLog(`application ${CenvLog.colors.errorBold(ApplicationName)} does not exist.`);
      }
      return false;
    }
    const env = await getEnvironment(ApplicationId, EnvironmentName, Silent);
    if (!env) {
      if (!Silent) {
        CenvLog.single.errorLog(`Environment ${CenvLog.colors.errorBold(EnvironmentName)} does not exist`);
      }
      return false;
    }
    const EnvironmentId = env.EnvironmentId;
    //infoLog([EnvironmentName, EnvironmentId]);
    const confRes = await getConfigurationProfile(ApplicationId, ConfigurationProfileName, Silent);
    if (!confRes) {
      if (!Silent) {
        CenvLog.single.errorLog(`configuration profile ${CenvLog.colors.errorBold(ConfigurationProfileName)} does not exist.`);
      }
      return false;
    }
    const ConfigurationProfileId = confRes.ConfigurationProfileId;
    if (!ConfigurationProfileId) {
      return false;
    }
    const confResMeta = await getConfigurationProfile(ApplicationId, ConfigurationProfileName + '_meta', Silent);
    let MetaConfigurationProfileId = '';
    if (confResMeta && confResMeta.ConfigurationProfileId) {
      MetaConfigurationProfileId = confResMeta.ConfigurationProfileId;
    }

    //infoLog([ConfigurationProfileId, EnvironmentId]);
    const deploymentStratRes = await getDeploymentStrategy();
    if (!deploymentStratRes || !deploymentStratRes.DeploymentStrategyId) {
      return false;
    }
    const DeploymentStrategyId = deploymentStratRes.DeploymentStrategyId;
    const config = {
      ApplicationName,
      ApplicationId,
      EnvironmentName,
      EnvironmentId,
      ConfigurationProfileId,
      MetaConfigurationProfileId,
      DeploymentStrategyId
    };
    const versRes = await getHostedConfigurationVersion(ApplicationId, ConfigurationProfileId);
    if (versRes?.VersionNumber) {
      return {config, version: versRes.VersionNumber}
    }
    return {config};
  } catch (e) {
    CenvLog.single.errorLog(['getApplication error', e as string])
    return false;
  }
}

export async function listEnvironments(ApplicationId: string) {
  const cmd = new ListEnvironmentsCommand({ApplicationId});

  try {
    const res = await getClient().send(cmd);
    return res.Items;
  } catch (e) {
    CenvLog.single.errorLog(['listEnvironments error', e as string])
  }
}

async function listConfigurationProfiles(ApplicationId: string) {
  const cmd = new ListConfigurationProfilesCommand({ApplicationId});

  try {
    const res = await getClient().send(cmd);
    return res.Items;
  } catch (e) {
    CenvLog.single.errorLog(['listConfigurationProfiles error', e as string])
  }
}

export async function listHostedConfigurationVersions(ApplicationId: string, ConfigurationProfileId: string) {
  const cmd = new ListHostedConfigurationVersionsCommand({ApplicationId, ConfigurationProfileId});
  try {
    const res = await getClient().send(cmd);
    return res.Items;
  } catch (e) {
    CenvLog.single.errorLog(['listHostedConfigurationVersions error', e as string])
  }
}

export async function getEnvironment(applicationId: string, environmentName: string, silent = true) {
  try {
    const environments = await listEnvironments(applicationId);
    let envId: string | null = null;
    if (environments) {
      for (let envIdx = 0; envIdx < environments.length; envIdx++) {
        const env = environments[envIdx];
        if (env.Name === environmentName && env.Id) {
          envId = env.Id;
          break;
        }
      }
    }
    if (!envId) {
      if (!silent) {
        CenvLog.single.errorLog(`environment ${CenvLog.colors.errorBold(environmentName)} does not exist.`);
      }
      return false;
    }
    return {EnvironmentId: envId};
  } catch (e) {
    CenvLog.single.errorLog(['getEnvironment error', e as string])
    return false;
  }
}

export async function getConfigurationProfile(applicationId: string, configurationProfileName: string, silent = true) {
  try {
    const res = await listConfigurationProfiles(applicationId);
    if (res) {
      let Id;
      let MetaId;
      for (let confProfIdx = 0; confProfIdx < res.length; confProfIdx++) {
        const confProf = res[confProfIdx];
        if (confProf.Name === configurationProfileName) {
          Id = confProf.Id;
        }
        if (confProf.Name === configurationProfileName + '_meta') {
          MetaId = confProf.Id;
        }
        if (Id && MetaId) {
          return {ConfigurationProfileId: Id, MetaConfigurationProfileId: MetaId};
        }
      }
      if (Id) {
        return {ConfigurationProfileId: Id};
      }
    }
    if (!silent) {
      CenvLog.single.errorLog(`Configuration profile ${configurationProfileName} does not exist.`);
    }
    return false;
  } catch (e) {
    CenvLog.single.errorLog(['getConfigurationProfile error', e as string])
    return false;
  }
}

export async function getHostedConfigurationVersion(ApplicationId: string, ConfigurationProfileId: string) {
  const command = new ListHostedConfigurationVersionsCommand({ApplicationId, ConfigurationProfileId});
  const result = {VersionNumber: 0};

  try {
    const response = await getClient().send(command);
    if (response.Items) {
      for (let idx = 0; idx < response.Items.length; idx++) {
        const hostedConfigVersion = response.Items[idx];
        if (hostedConfigVersion.VersionNumber && hostedConfigVersion.VersionNumber > result.VersionNumber) {
          result.VersionNumber = hostedConfigVersion.VersionNumber;
        }
      }
    }
    //result.ApplicationId = appId;
    return result;
  } catch (e) {
    CenvLog.single.errorLog(['getHostedConfigurationVersion error', e as string])
    return result;
  }
}

export async function deleteApplication(ApplicationId: string) {
  try {
    const command = new DeleteApplicationCommand({ApplicationId});
    const res = await getClient().send(command);
    return res;
  } catch (e) {
    CenvLog.single.errorLog(['deleteApplication error', e as string])
  }
}

export async function deleteEnvironments(ApplicationId: string, environments: Environment[]) {
  if (!environments || environments.length === 0) {
    CenvLog.single.errorLog(`There are no environments that belong to the application id ${ApplicationId}`);
    return;
  }

  try {
    for (let envIdx = 0; envIdx < environments.length; envIdx++) {
      const env = environments[envIdx];
      const command = new DeleteEnvironmentCommand({ApplicationId, EnvironmentId: env.Id});
      const res = await getClient().send(command);
    }
  } catch (e) {
    CenvLog.single.errorLog(['deleteEnvironments error', e as string])
  }
}

export async function deleteEnvironment(ApplicationId: string, EnvironmentId: string) {
  try {
    const command = new DeleteEnvironmentCommand({ApplicationId, EnvironmentId});
    const res = await getClient().send(command);
  } catch (e) {
    CenvLog.single.errorLog(['deleteEnvironment error', e as string]);
  }
}

export async function deleteConfigurationProfiles(ApplicationId: string, profiles: ConfigurationProfileSummary[]) {
  if (!profiles || profiles.length === 0) {
    CenvLog.single.errorLog(`There are no configuration profiles that belong to the application id ${ApplicationId}`);
    return;
  }

  try {
    for (let idx = 0; idx < profiles.length; idx++) {
      const profile = profiles[idx];
      if (profile.Id) {
        await deleteConfigurationProfile(ApplicationId, profile.Id);
      }
    }
  } catch (e) {
    CenvLog.single.errorLog(['deleteConfigurationProfiles error', e as string])
  }
}

export async function deleteConfigurationProfile(ApplicationId: string, ConfigurationProfileId: string) {
  try {
    const command = new DeleteConfigurationProfileCommand({ApplicationId, ConfigurationProfileId});
    const res = await getClient().send(command);
  } catch (e) {
    CenvLog.single.errorLog(`deleteConfigurationProfile error: ${e as string}`);
  }
}


export async function deleteHostedConfigurationVersions({
                                                          ApplicationName,
                                                          ApplicationId,
                                                          ConfigurationProfileName,
                                                          ConfigurationProfileId
                                                        }: {
  ApplicationName: string,
  ApplicationId: string,
  ConfigurationProfileName: string,
  ConfigurationProfileId: string
}, versions: any) {
  if (!versions || versions.length === 0) {
    CenvLog.info(`  - no configuration versions for ${CenvLog.colors.infoBold(ApplicationName)} [${CenvLog.colors.infoBold(ApplicationId)}] and configuration profile ${CenvLog.colors.infoBold(ConfigurationProfileName)} [${CenvLog.colors.infoBold(ConfigurationProfileId)}]`);
    return;
  }
  CenvLog.info(`  - deleting configuration versions for ${CenvLog.colors.infoBold(ApplicationName)} and configuration profile ${CenvLog.colors.infoBold(ConfigurationProfileName)}`);

  try {
    for (let idx = 0; idx < versions.length; idx++) {
      const version = versions[idx];
      await deleteHostedConfigurationVersion(ApplicationId, ConfigurationProfileId, version.VersionNumber);
    }
  } catch (e) {
    CenvLog.single.errorLog(`deleteHostedConfigurationVersions error: ${e as string}`);
  }
}

export async function deleteHostedConfigurationVersion(ApplicationId: string, ConfigurationProfileId: string, VersionNumber: number) {
  try {
    const command = new DeleteHostedConfigurationVersionCommand({ApplicationId, ConfigurationProfileId, VersionNumber});
    const res = await getClient().send(command);
  } catch (e) {
    CenvLog.single.errorLog(`deleteHostedConfigurationVersion error: ${e as string}`);
  }
}

export async function destroyRemainingConfigs() {
  const res: any = await listApplications();
  const apps: string[] = res?.map((app: Application) => {
    return app.Name;
  });

  if (apps?.length > 0) {
    CenvLog.single.infoLog(` - destroy all remaining app configs`)

    const destroyEm = apps?.map(async (app: string) => {
      await destroyAppConfig(app);
    });

    await Promise.allSettled(destroyEm);
  } else {
    CenvLog.single.infoLog(` - no app configs to destroy`)
  }
}

export async function destroyAppConfig(applicationName: string, silentErrors = false) {
  const application = await getApplication(applicationName);
  if (!application || !application.ApplicationId) {
    if (!silentErrors) {
      CenvLog.single.errorLog(`Could not delete application ${CenvLog.colors.errorBold(applicationName)} resources because the application doesn't exist`)
    }
    return;
  }

  try {
    const configurationProfiles = await listConfigurationProfiles(application.ApplicationId);
    if (configurationProfiles && configurationProfiles.length) {
      for (let idx = 0; idx < configurationProfiles.length; idx++) {
        const profile: ConfigurationProfileSummary = configurationProfiles[idx];
        if (profile.Id) {
          const versions = await listHostedConfigurationVersions(application.ApplicationId, profile.Id);
          if (versions && profile.Id && profile.Name) {
            CenvLog.single.infoLog(`  - deleting application ${CenvLog.colors.infoBold(applicationName)} configuration versions`);
            await deleteHostedConfigurationVersions({
                                                      ApplicationId: application.ApplicationId,
                                                      ApplicationName: applicationName,
                                                      ConfigurationProfileId: profile.Id,
                                                      ConfigurationProfileName: profile.Name
                                                    }, versions);
          }
        }
      }
      CenvLog.single.infoLog(`  - deleting configuration profile for application ${CenvLog.colors.infoBold(applicationName)}`);
      await deleteConfigurationProfiles(application.ApplicationId, configurationProfiles);
    }

    const environments = await listEnvironments(application.ApplicationId);
    if (environments && environments.length) {
      CenvLog.single.infoLog(`  - deleting environments for application ${CenvLog.colors.infoBold(applicationName)}`);
      await deleteEnvironments(application.ApplicationId, environments);
    }
    CenvLog.single.infoLog(`  - deleting application ${CenvLog.colors.infoBold(applicationName)}`);

    await deleteApplication(application.ApplicationId);
  } catch (e) {
    CenvLog.single.errorLog(['deleteAppConfig error', e as string])
  }
}

export async function deployConfig(configProfileContent: any, appConfigArgs: any = undefined) {

  const hostedConfigurationVersion = await createHostedConfigurationVersion(appConfigArgs.ApplicationId, appConfigArgs.ConfigurationProfileId, yaml.dump(configProfileContent));

  const deployment = await startDeployment(appConfigArgs.ApplicationId, appConfigArgs.ConfigurationProfileId, hostedConfigurationVersion.VersionNumber.toString(), appConfigArgs.EnvironmentId, appConfigArgs.DeploymentStrategyId);
}

export async function deleteCenvData(applicationName: string, parameters: any, applicationConfig: any, globalParameters = false) {
  if (applicationConfig) {
    await destroyAppConfig(applicationName, true);
  }

  if (parameters) {
    CenvLog.single.infoLog(`  - deleting application ${CenvLog.colors.infoBold(applicationName)} parameters`, applicationName);
    await deleteParametersByPath(`/service/${stripPath(applicationName)}`, '    -', applicationName);
  }
  if (globalParameters) {
    await deleteParametersByPath(`/globalenv/${process.env.ENV}`, '    -', 'GLOBAL');
    await deleteParametersByPath(`/global/${process.env.ENV}`, '    -', 'GLOBAL');
  }
}

export async function createAppEnvConf(applicationName: any, environmentName: any, configurationProfileName: any) {
  const appRes = await createApplication(applicationName);
  if (!appRes) {
    return false;
  }

  const envRes = await createEnvironment(appRes.Id, environmentName);
  if (!envRes) {
    return false;
  }
  const confRes = await createConfigurationProfile(appRes.Id, configurationProfileName);
  if (confRes) {
    return {
      ApplicationName: applicationName,
      EnvironmentName: environmentName,
      ApplicationId: appRes.Id,
      EnvironmentId: envRes.Id,
      ConfigurationProfileId: confRes.Id,
    }
  }
  return false;
}
