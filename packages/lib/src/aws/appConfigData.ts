import * as cron from 'node-cron';
import { AppConfigDataClient, GetLatestConfigurationCommand, StartConfigurationSessionCommand } from '@aws-sdk/client-appconfigdata';
import * as YAML from 'yaml';
import { CenvLog } from '../log';
import { CenvFiles, EnvConfig } from '../file';
import { decryptValue, isEncrypted } from './parameterStore';
import { getConfig } from './appConfig';

let _client: AppConfigDataClient;

const appTokens: {[applicationName: string]: { token: string, metaToken?: string }} = {};

function getClient() {
  if (_client) {
    return _client;
  }
  const { AWS_REGION, AWS_ENDPOINT } = process.env;

  _client = new AppConfigDataClient({
    region: AWS_REGION, endpoint: AWS_ENDPOINT,
  });
  return _client;
}

export async function startSession(applicationName: string, typed = false) {
  try {
    let config: any = CenvFiles.EnvConfig;
    if (!config || !config.ApplicationId || !config.EnvironmentId || (!config.ConfigurationProfileId && !typed) || (!config.MetaConfigurationProfileId && typed)) {
      config = await getConfig(applicationName, CenvFiles.ENVIRONMENT, typed ? 'config_meta': 'config', false);

      if (!config) {
        CenvLog.single.catchLog([`startSession error ${applicationName}`, 'No config found', '\n', JSON.stringify(config, null, 2)]);
        process.exit(392);
      }

      config = new EnvConfig(config);
      if (!config.valid) {
        CenvLog.single.catchLog([`startSession error ${applicationName}`, 'config is not valid', '\n', JSON.stringify(config, null, 2)]);
        process.exit(393);
      }
    }
    const params = { ApplicationIdentifier: config.ApplicationId, EnvironmentIdentifier: config.EnvironmentId, ConfigurationProfileIdentifier: !typed ? config.ConfigurationProfileId : config.MetaConfigurationProfileId};
    const command = new StartConfigurationSessionCommand(params);
    const response = await getClient().send(command);
    return response.InitialConfigurationToken ? response.InitialConfigurationToken : false;
  } catch (e) {
    CenvLog.single.catchLog(['startSession error', e instanceof Error ? e.message : e as string]);
    process.exit(398)
  }
}

export async function getDecodedConfig(token: any) {
  try {
    const getConfigParams = { ConfigurationToken: token };
    const command = new GetLatestConfigurationCommand(getConfigParams);
    const response = await getClient().send(command);
    const decodedConfig = new TextDecoder().decode(response.Configuration);
    return { decodedConfig, token: response.NextPollConfigurationToken! };
  } catch (e) {
    //CenvLog.single.errorLog(['getDecodedConfig error', e instanceof Error ? e.message : e as string]);
    CenvLog.single.catchLog(`getDecodedConfig error ${e instanceof Error ? e.stack : e as string}`);
  }
  process.exit(334);
}

export async function getLatestConfiguration(applicationName: string, allValues = false) {

  try {
    const configPkg: any = { config: undefined, metaConfig: undefined };
    const resConfig = await getDecodedConfig(appTokens[applicationName].token);
    appTokens[applicationName].token = resConfig.token;
    configPkg.config = resConfig.decodedConfig;
    if (appTokens[applicationName].metaToken) {
      const resMetaConfig = await getDecodedConfig(appTokens[applicationName].metaToken);
      appTokens[applicationName].metaToken = resMetaConfig.token;
      configPkg.metaConfig = resMetaConfig.decodedConfig;
    }

    return await parseConfig(configPkg.config, allValues, configPkg.metaConfig);
  } catch (e) {
    CenvLog.single.errorLog( e instanceof Error ? e.stack : e);
    process.exit(796);
  }
}

async function parseConfig(configInput: any, allValues = false, metaConfigInput: any = undefined) {
  const ymlConfig = YAML.parse(configInput);
  const ymlMetaConfig = metaConfigInput ? YAML.parse(metaConfigInput) : undefined;
  const updatedConfig: any = {};
  const env: { [key: string]: string | undefined } = process.env;
  if (!ymlConfig) {
    return updatedConfig;
  }
  for (const [key, value] of Object.entries(ymlConfig)) {
    if (ymlMetaConfig && !updatedConfig[ymlMetaConfig[key]]) {
      updatedConfig[ymlMetaConfig[key]] = {};
    }
    if ((env[key] != value as string && value !== undefined) || allValues) {
      let updatedConfigValue = value
      env[key] = value as string;
      if (isEncrypted(value as string)) {
        env[key] = await decryptValue(value as string);
        updatedConfigValue = '-=[DECRYPTED VALUE]=-';
      }
      if (ymlMetaConfig) {
        updatedConfig[ymlMetaConfig[key]][key] = updatedConfigValue;
      } else {
        updatedConfig[key] = updatedConfigValue;
      }
    }
  }

  ymlConfig.release;

  return updatedConfig;
}

interface StartConfigPollingParams {
  cronExpression?: string;
  postConfigCallback?: () => Promise<void>;
}

function startConfigPolling(applicationName: string, options: StartConfigPollingParams) {
  let count = 0;
  cron.schedule(options?.cronExpression ? options?.cronExpression : '0 * * * *', async () => {
    count += 1;
    console.log(count % 2 === 0 ? CenvLog.colors.info('poll') : CenvLog.colors.info('poll'));
    if (appTokens[applicationName].token) {
      const res = await getLatestConfiguration(applicationName, true);
      displayConfigVars('UPDATED CONFIG VARS', res);
    } else {
      await getConfigVars(applicationName, false, false);
    }
    if (options?.postConfigCallback) {
      await options?.postConfigCallback();
    }
  });
}

function displayConfigVars(title: string, configVars: any, exports = false) {
  if (Object.keys(configVars).length === 0) {
    return;
  }
  const configVarsDisplay: { [key: string]: string } = configVars;
  for (const [key, value] of Object.entries(configVarsDisplay)) {
    if (key.toLowerCase().indexOf('pass') > -1) {
      configVarsDisplay[key] = '[****]';
    }
  }

  console.log(new Error(title).stack)
  console.log('*************************************************************************');
  console.log(`****************************** ${CenvLog.colors.stdHighlightUnderline(title)} ******************************`);
  console.log('*************************************************************************');
  if (exports) {
    Object.entries(configVarsDisplay).forEach(([key, value]) => {
      console.log(`export ${CenvLog.colors.stdHighlight(key)}=${CenvLog.colors.stdHighlight(value)}`);
    });
  } else {
    console.log(CenvLog.colors.std(YAML.stringify(configVars)));
  }
  console.log('*******************************************************************');
}

export async function getConfigVars(applicationName: string, allValues = false, silent = true, exports = false, typed = false) {

  const token = await startSession(applicationName);


  if (!token) {
    CenvLog.single.catchLog(`could not start appConfigData session for ${applicationName}: no config found\``);
    process.exit(229)
  }

  appTokens[applicationName] = { token };
  if (typed) {
    const metaToken = await startSession(applicationName, true);
    if (!metaToken) {
      CenvLog.single.errorLog(`could not start appConfigData session for ${applicationName}: no meta config found`);
      process.exit(239)
    }
    appTokens[applicationName].metaToken = metaToken;
  }

  const latestConfig = await getLatestConfiguration(applicationName, allValues);
  if (latestConfig && !silent) {
    displayConfigVars('CONFIG VARS', latestConfig, exports);
  }
  return latestConfig;
}

export async function pollDeployedVars(applicationName: string, cronExpression: string, silent = true): Promise<any> {
  const configVars = await getConfigVars(applicationName, false, silent);
  if (cronExpression) {
    startConfigPolling(applicationName, { cronExpression });
  }
  return configVars;
}

export enum ClientMode {

  // never try to contact AWS for config data
  LOCAL_ONLY = 'LOCAL_ONLY',

  // only try to contact aws for config data if it doesn't exist locally
  LOCAL_DEFAULT = 'LOCAL_DEFAULT',

  // never use local config data... don't poll for data just get it on startup
  REMOTE_ON_STARTUP = 'REMOTE_ON_STARTUP',

  // always pull initial config data from aws and then poll for updates.. never use local data
  REMOTE_POLLING = 'REMOTE_POLLING',
}

export async function startCenv(clientType: ClientMode, applicationName: string, cronExpression = '0 * * * *', silent = false) {

  try {

    if (clientType === ClientMode.LOCAL_ONLY || clientType === ClientMode.LOCAL_DEFAULT) {
      const vars = await CenvFiles.GetLocalVars(applicationName, false, true);
      const parsedVars = await parseConfig(YAML.stringify(vars));
      if (!silent) {
        displayConfigVars('INITIAL CONFIG VARS', parsedVars);
      }
      if (clientType === ClientMode.LOCAL_ONLY) {
        return;
      }
    }

    return await pollDeployedVars(applicationName, clientType === ClientMode.REMOTE_POLLING ? cronExpression : '0 * * * *', silent);
  } catch (e) {
    CenvLog.single.alertLog(`startConfigPolling failed: ${CenvLog.colors.alertBold(`${e instanceof Error ? e.message : e as string}`)}\n ${JSON.stringify(e, null, 4)}`);
  }
}
