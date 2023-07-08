import read from 'read';
import { hostname } from 'os';
import { BaseCommandOptions } from './params'
import {
  infoAlert,
  infoInput,
  errorBold,
  infoBold,
  infoAlertBold,
  CenvLog
} from './log';
import path, { join } from 'path';
import fs, { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { getAccountId } from './aws/sts';
import { inputArgsToEnvVars, isLocalStackRunning, search_sync } from "./utils";
import { getKey } from './aws/kms';
import { listHostedZones } from './aws/route53';
import { getExportValue } from './aws/cloudformation';
import { CenvFiles } from "./file";
// eslint-disable-next-line @typescript-eslint/no-var-requires

export async function readAsync(prompt: string, defaultValue: string): Promise<string> {
  try {
    const finalPrompt = `${prompt}:`;
    return await read({ prompt: finalPrompt, default: `${infoInput(defaultValue)}` }, );
  } catch (e) {
    CenvLog.single.errorLog(`readAsync error:\n ${e}\nError: ${e.message}`);
  }
}
function cleanString(input: string) {
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
}

export async function ioReadVar(prompt: string, varValue: string, defaultValue: string, defaults = false, protectedMode = false): Promise<string> {
  if (!varValue) {
    if (!defaults) {
      if (protectedMode && defaultValue.match(/^<\].*?\[>$/)?.length) {
        CenvLog.single.infoLog(`${infoBold(prompt)}: ${infoBold(defaultValue)}(read-only)`)
        varValue = defaultValue;
      } else {
        varValue = await readAsync(prompt, defaultValue);
      }
    } else {
      varValue = defaultValue;
    }
  }
  return cleanString(varValue);
}

export async function ioAppEnv(config: any, application: any, environment: any, overwrite = false, defaults = false) {
  if (config?.ConfigurationId && !overwrite) {
    CenvLog.single.errorLog(`This application is already initialized. Run "${errorBold('cenv init --force')}" to reset the application to start from scratch.`);
    return;
  }
  application = await ioReadVar('application name', application.value, application.defaultValue, defaults);
  console.log('application', application)
  environment = await ioReadVar('environment name', environment.value, environment.defaultValue, defaults);

  return { application, environment };
}

export async function ioReadVarList(keyValueList: any, protectedMode = false) {
  for(const [key, value] of Object.entries(keyValueList)) {
    const output = await ioReadVar(key, undefined, value as string, false, protectedMode);
    keyValueList[key] = output;
  }
  return keyValueList;
}

export async function ioYesOrNo(prompt = 'Are you sure?', defaultValue = 'n'): Promise<boolean> {
  const answer = await readAsync(
    infoAlert(`${prompt} (y/${infoInput('n')})`), defaultValue,
  );
  if (answer === 'y') {
    return true;
  }
  return false;
}

function getContextConfig() {
  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, ROOT_DOMAIN, CDK_DEFAULT_ACCOUNT, CDK_DEFAULT_REGION, ENV } = process.env;
  if (AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY && AWS_REGION && ROOT_DOMAIN && CDK_DEFAULT_ACCOUNT && CDK_DEFAULT_REGION && ENV) {
    const args= {AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, ROOT_DOMAIN, CDK_DEFAULT_ACCOUNT, CDK_DEFAULT_REGION, ENV };
    process.env.CENV_CONFIGURE = inputArgsToEnvVars(args);
    return args;
  }
  return false;
}

export interface ConfigureCommandOptions extends BaseCommandOptions {
  localstackApiKey?: string;
  show?: boolean;
  key?: boolean;
}

const defaultAwsRegion = 'us-east-1';
let defaultRootDomain = `${hostname}.stokedconsulting.com`;

async function getAccountInfo() {
  const callerIdentity: any = process.env.ENV === 'local' ? { Account: '000000000000', User: '' } : await getAccountId();
  const accountId = callerIdentity.Account;
  if (!accountId) {
    return false;
  }
  const args: any = {};
  process.env['CDK_DEFAULT_ACCOUNT'] = accountId;
  args['CDK_DEFAULT_ACCOUNT'] = accountId;
  process.env['AWS_ACCOUNT_USER'] = callerIdentity.User;
  args['AWS_ACCOUNT_USER'] = callerIdentity.User;
  process.env['AWS_ACCOUNT_USER_ARN'] = callerIdentity.UserArn;
  args['AWS_ACCOUNT_USER_ARN'] = callerIdentity.UserArn;
  return args;
}

export function printProfileQuery(profile: string, environment: string) {
  return `${profile ? `profile: ${infoAlertBold(profile)} ` : ''}${environment ? `environment: ${infoAlertBold(environment)} ` : ''}`;
}

export interface ProfileData   {
  envConfig?: any,
  profilePath: string,
  askUser: boolean
}

export function createDirIfNotExists(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path);
  }
}

export async function getProfiles(paramMatchesOnly = false, profile = '' , environment = '') {
  const filename = profile === 'default' ? 'default' : `${profile}↔${environment}`;
  const reservedFiles = ['localstack-api-key', 'default-root-domain']

  createDirIfNotExists(CenvFiles.ProfilePath);

  const list = fs.readdirSync(CenvFiles.ProfilePath);
  const matchingProfileFiles: ProfileData[] = [];
  for (let i = 0; i < list.length; i++) {
    const file = list[i];
    const stat = fs.statSync(path.join(CenvFiles.ProfilePath, file));
    if (stat && stat.isDirectory()) {
      continue;
    }

    const fileBase = path.basename(file);
    if (!paramMatchesOnly && fileBase.indexOf('↔') !== -1) {
      CenvLog.single.alertLog(`the .cenv profile ${file} appears to have already been upgraded`);
      continue;
    }

    if (reservedFiles.includes(fileBase)) {
      continue;
    }

    if (!paramMatchesOnly) {
      const profConfig: ProfileData = await loadCenvProfile(fileBase);
      matchingProfileFiles.push(profConfig);
      continue;
    } else if (fileBase.indexOf(filename) === -1) {
      continue;
    }

    const profConfig: ProfileData = await loadCenvProfile(fileBase);
    matchingProfileFiles.push(profConfig);
  }
  return matchingProfileFiles;
}

export async function getMatchingProfileConfig(exactMatch: boolean, profile?: string, environment?: string): Promise<ProfileData> {
  const matchingProfileFiles: ProfileData[] = await getProfiles(exactMatch, profile, environment);
  if (matchingProfileFiles.length === 1) {
    return matchingProfileFiles[0];
  } else if (matchingProfileFiles.length > 1) {
    printProfileQuery(profile, environment);
    CenvLog.single.alertLog(`Multiple profiles match your query: ${printProfileQuery(profile, environment)}.\n\nPlease specify both the profile and the environment options. The following are the matching profiles:\n\n`);
    matchingProfileFiles.forEach((profileData) => {
      CenvLog.single.stdLog(printProfileQuery(profileData.envConfig.AWS_PROFILE, profileData.envConfig.ENV))
    });
    process.exit(0);
  } else if (!exactMatch) {
    CenvLog.single.alertLog(`No profiles matched the query: ${printProfileQuery(profile, environment)}`);
    process.exit(0);
  }
  return {
    profilePath: `${path.join(CenvFiles.ProfilePath, 'default')}`,
    askUser: true
  };
}

export async function loadCenvProfile(filename: string, options?: Record<string, any>,) {
  let envConfig;
  let profilePath;

  if (filename) {
    profilePath = join(process.env.HOME, `.cenv/${filename}`);
  } else {
    profilePath = join(process.env.HOME, `.cenv/default`)
  }
  let alwaysAsk: boolean = undefined;
  if (existsSync(profilePath)) {
    envConfig = JSON.parse(readFileSync(profilePath, 'utf8'));
    if (!envConfig.CDK_DEFAULT_ACCOUNT) {
      process.env.AWS_PROFILE = envConfig.AWS_PROFILE;
      process.env.AWS_REGION = envConfig.AWS_REGION;
      const accountInfo = await getAccountInfo();
      if (!accountInfo) {
        return;
      }
      envConfig = {...envConfig, ...accountInfo };
      writeFileSync(profilePath, JSON.stringify(envConfig));
    }
  } else if (options?.show) {
    CenvLog.single.alertLog(`no configuration currently setup to show run '${infoAlertBold('cenv configure')}'`);
    process.exit();
  } else {
    alwaysAsk = true;
  }

  return {envConfig, profilePath, askUser: alwaysAsk };
}

export async function configure(options: any, alwaysAsk = false, verifyLocalRunning = false) {
  if (process.env.CENV_LOCAL) {
    options.profile = 'local';
  }
  if (options?.profile === 'local') {
    process.env.CENV_LOCAL = 'true';
  }

  const localstackApiKeyPath = join(CenvFiles.ProfilePath, `localstack-api-key`);
  const defaultRootDomainPath = join(CenvFiles.ProfilePath, `default-root-domain`);
  if (options?.localstackApiKey !== undefined && !alwaysAsk) {
    process.env.LOCALSTACK_API_KEY = options.localstackApiKey;
    writeFileSync( localstackApiKeyPath, options.localstackApiKey);
    return;
  }

  // verify that we need a config at all
  if (options?.profile === 'default' && !alwaysAsk) {
    const contextConfig = getContextConfig();
    if (contextConfig) {
      return contextConfig;
    }
  }

  let profileData: ProfileData = undefined;
  let profilePath = '';
  if (!alwaysAsk) {
    profileData = await getMatchingProfileConfig(true, options?.profile, options?.env);
    profilePath = profileData.profilePath;
    alwaysAsk = profileData.askUser;
  } else {
    profilePath = join(CenvFiles.ProfilePath, `default`);
  }

  let args: any = {};
  let envConfig = profileData?.envConfig;

  alwaysAsk = profileData?.askUser;

  if (existsSync(defaultRootDomainPath)) {
    defaultRootDomain = readFileSync(defaultRootDomainPath, 'utf8');
  }

  const localDefaults = {
    AWS_REGION: 'us-east-1',
    ENV: 'local',
    ROOT_DOMAIN: 'localhost'
  };

  if (options?.profile === 'local') {
    args = envConfig || localDefaults
  }

  let kmsKey = null
  if (!envConfig || (alwaysAsk && !options?.show)) {
    if (options?.profile !== 'local') {
      args = envConfig || {
        AWS_PROFILE: 'aws-profile',
        AWS_REGION: 'us-east-1',
        ENV: 'dev'
      }
    }

    let envVars = null;
    if (process.env.CENV_LOCAL && !alwaysAsk) {
      envVars = localDefaults;
    } else if (process.env.CENV_DEFAULTS && !alwaysAsk) {
      envVars = args;
    } else {
      envVars = await ioReadVarList(args);
    }

    if (options?.profile !== 'local') {
      process.env.AWS_PROFILE = envVars.AWS_PROFILE;
      process.env.AWS_REGION = envVars.AWS_REGION;
      if (!envVars.KMS_KEY && options?.key) {
        kmsKey = await getKey();
        let args2 = { KMS_KEY: kmsKey ? kmsKey : '' };
        args2 = await ioReadVarList(args2);
        envVars.KMS_KEY = args2.KMS_KEY;
      }
      if (!envVars.ROOT_DOMAIN) {
        const listZoneRes: any = await listHostedZones();
        let args2 = { ROOT_DOMAIN: defaultRootDomain };
        for (let i = 0; i < listZoneRes.HostedZones.length; i++) {
          const zone = listZoneRes.HostedZones[i].Name;
          if (zone.endsWith('your-domain.com.')) {
            args2.ROOT_DOMAIN = zone.slice(0, -1)
          }
        }
        args2 = await ioReadVarList(args2);
        envVars.ROOT_DOMAIN = args2.ROOT_DOMAIN;
      }
    }

    if (!existsSync(join(process.env.HOME, '.cenv'))) {
      mkdirSync(join(process.env.HOME, '.cenv'), { recursive: true });
    }
    writeFileSync(profilePath, JSON.stringify(envVars, null, 2));
    envConfig = envVars;
  }

  for (const [key, value] of Object.entries(envConfig) as [string, string][]) {
    process.env[key] = value;
    args[key] = value;
    if (key === 'AWS_REGION') {
      process.env['CDK_DEFAULT_REGION'] = value;
      args['CDK_DEFAULT_REGION'] = value;
    }
    if (key === 'AWS_PROFILE') {

      const awsCredsFile = join(process.env.HOME, '.aws/credentials');
      if (existsSync(awsCredsFile)) {
        const credentials = readFileSync(awsCredsFile, 'utf8')
        if (value === 'local') {
          process.env.AWS_ACCESS_KEY_ID = 'local';
          process.env.AWS_SECRET_ACCESS_KEY = 'local';
        } else {
          const prof = credentials.split(`[${value}]`)[1]?.split('[')[0];
          process.env.AWS_ACCESS_KEY_ID = prof?.split('aws_access_key_id = ')[1]?.split('\n')[0];
          process.env.AWS_SECRET_ACCESS_KEY = prof?.split('aws_secret_access_key = ')[1]?.split('\n')[0];
        }
      }
    }
  }

  if (process.env.ENV === 'local') {
    process.env.AWS_ENDPOINT = 'http://localhost:4566';
    args['AWS_ENDPOINT'] = 'http://localhost:4566';
    if (existsSync(localstackApiKeyPath)) {
      const localstackApiKey = readFileSync(join(process.env.HOME, `.cenv/localstack-api-key`), { encoding: 'utf8' });
      args['LOCALSTACK_API_KEY'] = localstackApiKey;
      process.env.LOCALSTACK_API_KEY = localstackApiKey;
    }
  } else {
    delete process.env.AWS_ENDPOINT
  }
  args['AWS_ACCESS_KEY_ID'] = process.env.AWS_ACCESS_KEY_ID;
  args['AWS_SECRET_ACCESS_KEY'] = process.env.AWS_SECRET_ACCESS_KEY;

  if (!args['CDK_DEFAULT_ACCOUNT'] || !args['AWS_ACCOUNT_USER'] || !['AWS_ACCOUNT_USER_ARN']) {
    const accountInfo: any = process.env.ENV === 'local' ? { Account: '000000000000', User: '' } : await getAccountInfo();
    if (!accountInfo) {
      process.exit(9);
    } else {
      args = {...args, ...accountInfo};
    }
  }


  if (!process.env['KMS_KEY']) {
    const kmsKey = await getKey();
    if (kmsKey) {
      process.env['KMS_KEY'] = kmsKey;
      args['KMS_KEY'] = kmsKey;
    }
  }

  if (options?.show) {
    CenvLog.single.infoLog(`${JSON.stringify(args, null, 2)}`);
  }

  process.env['VITE_APP_ROOT_DOMAIN'] = process.env['ROOT_DOMAIN'];
  process.env['VITE_APP_ENV'] = process.env['ENV'];

  if (args['ENV'] != 'local') {
    writeFileSync( defaultRootDomainPath, args['ROOT_DOMAIN']);
  }

  if (process.env.ENV === 'local' && verifyLocalRunning) {
    if (!await isLocalStackRunning())
      process.exit(5);
  }

  if (process.env.AWS_PROFILE === 'local') {
    delete args.AWS_PROFILE;
    delete process.env.AWS_PROFILE
  }

  const cidr = await getExportValue('cidr', true);
  if (cidr) {
    process.env.CENV_NETWORK_CIDR = cidr;
    args['CENV_NETWORK_CIDR'] = cidr;
  }

  // because cdk logs everything to stderr by default.. fucking annoying..
  process.env.CI = 'true';
  args.CI = 'true';
  return args;
}
