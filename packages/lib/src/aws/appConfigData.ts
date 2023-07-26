import * as cron from "node-cron";
import {
  AppConfigDataClient, GetLatestConfigurationCommand, StartConfigurationSessionCommand
} from "@aws-sdk/client-appconfigdata";
import * as YAML from 'yaml';
import * as chalk from 'chalk';
import {CenvParams} from '../params';
import {CenvLog, info, infoAlertBold} from '../log';
import {CenvFiles} from '../file';
import {decryptValue, isEncrypted} from './parameterStore';
import {getConfig} from "./appConfig";

let _client: AppConfigDataClient;

function getClient() {
  if (_client) {
    return _client;
  }
  const {AWS_REGION, AWS_ENDPOINT} = process.env;

  _client = new AppConfigDataClient({
                                      region: AWS_REGION, endpoint: AWS_ENDPOINT
                                    });
  return _client;
}

export async function startSession() {
  if (CenvFiles.EnvConfig.ApplicationId === undefined || CenvFiles.EnvConfig.EnvironmentId === undefined || CenvFiles.EnvConfig.ConfigurationProfileId === undefined) {
    const configRes = await getConfig(process.env.APPLICATION_NAME!);
    if (!configRes) {
      CenvLog.single.catchLog(['startSession error', 'No config found']);
      process.exit();
    }
    CenvFiles.EnvConfig = configRes.config
  }
  const command = new StartConfigurationSessionCommand(CenvFiles.SESSION_PARAMS);
  try {
    const response = await getClient().send(command);
    return response.InitialConfigurationToken;
  } catch (e) {
    CenvLog.single.errorLog(['startSession error', e instanceof Error ? e.message : e as string])
    return false;
  }
}

export async function getLatestConfiguration(token: any, allValues = false) {
  const getConfigParams = {ConfigurationToken: token};
  const command = new GetLatestConfigurationCommand(getConfigParams);
  let result = {};
  try {
    const response = await getClient().send(command);
    process.env.NextPollConfigurationToken = response.NextPollConfigurationToken;
    const configParamsDecoded = new TextDecoder().decode(response.Configuration);
    if (configParamsDecoded) {
      result = await parseConfig(configParamsDecoded, allValues);
    }
    return result
  } catch (e) {
    CenvLog.single.errorLog(['getLatestConfiguration error', e instanceof Error ? e.message : e as string])
    return result;
  }
}

async function parseConfig(configInput: any, allValues = false) {
  const ymlConfig = YAML.parse(configInput);
  const updatedConfig: any = {};
  const env: { [key: string]: string | undefined } = process.env;
  for (const [key, value] of Object.entries(ymlConfig)) {
    if ((env[key] != value as string && value !== undefined) || allValues) {
      if (isEncrypted(value as string)) {
        env[key] = await decryptValue(value as string);
        updatedConfig[key] = '-=[DECRYPTED VALUE]=-';
      } else {
        env[key] = value as string;
        updatedConfig[key] = value;
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

function startConfigPolling(options: StartConfigPollingParams) {
  console.log(chalk.green(`polling cron: ${options?.cronExpression}`));
  let count = 0;
  cron.schedule(options?.cronExpression ? options?.cronExpression : '0 * * * *', async () => {
    count += 1;
    console.log(count % 2 === 0 ? chalk.gray('poll') : info('poll'));
    if (process.env.NextPollConfigurationToken) {
      const res = await getLatestConfiguration(process.env.NextPollConfigurationToken, true);
      displayConfigVars('UPDATED CONFIG VARS', res);
    } else {
      await getConfigVars(false, false, 'UPDATED CONFIG VARS');
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
      configVarsDisplay[key] = '[****]'
    }
  }

  CenvLog.info('*******************************************************************');
  CenvLog.info(`*********************** ${chalk.whiteBright.underline(title)} ***********************`);
  CenvLog.info('*******************************************************************\n');
  if (exports) {
    Object.entries(configVarsDisplay).forEach(([key, value]) => {
      console.log(`export ${chalk.whiteBright(key)}=${chalk.whiteBright(value)}`)
    });
  } else {
    console.log(chalk.white(YAML.stringify(configVars)));
  }
  CenvLog.info('*******************************************************************');
}

export async function getConfigVars(allValues = false, silent = true, title = 'INITIAL CONFIG VARS', exports = false) {

  let token = await startSession();

  if (!token) {
    CenvLog.single.errorLog('could not start appConfigData session');
  }

  const latestConfig = await getLatestConfiguration(token, allValues);
  if (latestConfig && !silent) {
    displayConfigVars(title, latestConfig, exports);
  }
  return latestConfig
}

export async function pollDeployedVars(cronExpression: string, silent = true): Promise<any> {
  const configVars = await getConfigVars(false, silent, 'DEPLOYED CONFIG VARS');

  if (cronExpression) {
    startConfigPolling({cronExpression});
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

export async function startCenv(clientType: ClientMode, cronExpression = '0 * * * *', silent = false) {

  try {

    if (clientType === ClientMode.LOCAL_ONLY || clientType === ClientMode.LOCAL_DEFAULT) {
      const vars = await CenvFiles.GetVars(false, true);
      const parsedVars = await parseConfig(YAML.stringify(vars));
      if (!silent) {
        displayConfigVars('INITIAL CONFIG VARS', parsedVars);
      }
      if (clientType === ClientMode.LOCAL_ONLY) {
        return;
      }
      await CenvParams.pull(true)
    } else {

      if (!process.env.APPLICATION_NAME || !process.env.ENV) {
        CenvFiles.GetConfig();
      }
    }

    return await pollDeployedVars(clientType === ClientMode.REMOTE_POLLING ? cronExpression : '0 * * * *', silent);
  } catch (e) {
    CenvLog.single.alertLog(`startConfigPolling failed: ${infoAlertBold(`${e instanceof Error ? e.message : e as string}`)}\n ${JSON.stringify(e, null, 4)}`);
  }
}
