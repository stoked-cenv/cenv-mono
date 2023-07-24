import read from 'read';
import {hostname} from 'os';
import * as path from 'path';
import {BaseCommandOptions} from './params'
import {CenvLog, errorBold, infoAlert, infoAlertBold, infoBold, infoInput} from './log';
import {existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync} from 'fs';
import {getAccountId} from './aws/sts';
import {EnvVars, inputArgsToEnvVars, validateEnvVars} from "./utils";
import {getKey} from './aws/kms';
import {listHostedZones} from './aws/route53';
import {getExportValue} from './aws/cloudformation';
import {CenvFiles} from "./file";
import {HostedZone} from "@aws-sdk/client-route-53";

//const envVars = validateEnvVars(['HOME', 'CENV_PROFILE_PATH'])

// eslint-disable-next-line @typescript-eslint/no-var-requires


export async function readAsync(prompt: string, defaultValue: string): Promise<string> {
  try {
    const finalPrompt = `${prompt}:`;
    return await read({prompt: finalPrompt, default: `${infoInput(defaultValue)}`},);
  } catch (e) {
    CenvLog.single.catchLog(`readAsync error:\nError: ${e as string}`);
    process.exit(99);
  }
}

function cleanString(input: string) {
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
}

export async function ioReadVar(prompt: string, varValue: string | undefined, defaultValue: string, defaults = false, protectedMode = false): Promise<string> {
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

  return {application, environment};
}

export async function ioReadVarList(keyValueList: any, protectedMode = false): Promise<Record<string, string>> {
  for (const [key, value] of Object.entries(keyValueList)) {
    const output = await ioReadVar(key, undefined, value as string, false, protectedMode);
    keyValueList[key] = output;
  }
  return keyValueList;
}

export async function ioYesOrNo(prompt = 'Are you sure?', defaultValue = 'n'): Promise<boolean> {
  const answer = await readAsync(infoAlert(`${prompt} (y/${infoInput('n')})`), defaultValue,);
  if (answer === 'y') {
    return true;
  }
  return false;
}

function getContextConfig() {
  const {
    AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, ROOT_DOMAIN, CDK_DEFAULT_ACCOUNT, CDK_DEFAULT_REGION, ENV
  } = process.env;
  if (AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY && AWS_REGION && ROOT_DOMAIN && CDK_DEFAULT_ACCOUNT && CDK_DEFAULT_REGION && ENV) {
    const args = {
      AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, ROOT_DOMAIN, CDK_DEFAULT_ACCOUNT, CDK_DEFAULT_REGION, ENV
    };
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
  const callerIdentity: any = process.env.ENV === 'local' ? {Account: '000000000000', User: ''} : await getAccountId();
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

export function printProfileQuery(profile?: string, environment?: string) {
  if (!profile && !environment) {
    return `the profile query contains neither a profile or an environment`;
  }
  return `${profile ? `profile: ${infoAlertBold(profile)} ` : ''}${environment ? `environment: ${infoAlertBold(environment)} ` : ''}`;
}

export interface ProfileData {
  envConfig?: Record<string, string>,
  profilePath: string,
  askUser: boolean
}

export function createDirIfNotExists(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path);
  }
}

export async function getProfiles(paramMatchesOnly = false, profile = '', environment = '') {
  const filename = profile === 'default' ? 'default' : `${profile}↔${environment}`;
  const reservedFiles = ['localstack-api-key', 'default-root-domain']

  createDirIfNotExists(CenvFiles.ProfilePath);

  const list = readdirSync(CenvFiles.ProfilePath);
  const matchingProfileFiles: ProfileData[] = [];
  for (let i = 0; i < list.length; i++) {
    const file = list[i];
    const stat = statSync(path.join(CenvFiles.ProfilePath, file));
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
      const profConfig: ProfileData = await loadCenvProfile(fileBase) as ProfileData;
      matchingProfileFiles.push(profConfig);
      continue;
    } else if (fileBase.indexOf(filename) === -1) {
      continue;
    }

    const profConfig: ProfileData = await loadCenvProfile(fileBase) as ProfileData;
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
      CenvLog.single.stdLog(printProfileQuery(profileData.envConfig?.AWS_PROFILE, profileData.envConfig?.ENV))
    });
    process.exit(0);
  } else if (!exactMatch) {
    CenvLog.single.alertLog(`No profiles matched the query: ${printProfileQuery(profile, environment)}`);
    process.exit(0);
  }
  return {
    profilePath: `${path.join(CenvFiles.ProfilePath, 'default')}`, askUser: true
  };
}

export async function loadCenvProfile(filename: string, options?: Record<string, any>,) {
  let envConfig;
  let profilePath;

  if (filename) {
    profilePath = path.join(process.env.HOME!, `.cenv/${filename}`);
  } else {
    profilePath = path.join(process.env.HOME!, `.cenv/default`)
  }
  let alwaysAsk: boolean = false;
  if (existsSync(profilePath)) {
    envConfig = JSON.parse(readFileSync(profilePath, 'utf8'));
    if (!envConfig.CDK_DEFAULT_ACCOUNT) {
      process.env.AWS_PROFILE = envConfig.AWS_PROFILE;
      process.env.AWS_REGION = envConfig.AWS_REGION;
      const accountInfo = await getAccountInfo();
      if (!accountInfo) {
        return;
      }
      envConfig = {...envConfig, ...accountInfo};
      writeFileSync(profilePath, JSON.stringify(envConfig));
    }
  } else if (options?.show) {
    CenvLog.single.alertLog(`no configuration currently setup to show run '${infoAlertBold('cenv configure')}'`);
    process.exit();
  } else {
    alwaysAsk = true;
  }

  return {envConfig, profilePath, askUser: alwaysAsk};
}

export async function configure(options: any, alwaysAsk = false, verifyLocalRunning = false) {

  const defaultRootDomainPath = path.join(CenvFiles.ProfilePath, `default-root-domain`);

  // verify that we need a config at all
  if (options?.profile === 'default' && !alwaysAsk) {
    const contextConfig = getContextConfig();
    if (contextConfig) {
      return contextConfig;
    }
  }

  let profileData: ProfileData = {askUser: alwaysAsk, profilePath: path.join(process.env.CENV_PROFILE_PATH!, 'default')};
  let profilePath = '';
  if (!alwaysAsk) {
    profileData = await getMatchingProfileConfig(true, options?.profile, options?.env);
    profilePath = profileData.profilePath;
    alwaysAsk = profileData.askUser;
  } else {
    profilePath = path.join(CenvFiles.ProfilePath, `default`);
  }

  //let args: Record<string, string> = {};
  let envConfig = profileData?.envConfig;

  if (existsSync(defaultRootDomainPath)) {
    defaultRootDomain = readFileSync(defaultRootDomainPath, 'utf8');
  }

  let envVarList = new EnvVars();
  if (!envConfig || (alwaysAsk && !options?.show)) {
    envVarList.setVars(envConfig || {
      AWS_PROFILE: 'default', AWS_REGION: 'us-east-1', ENV: 'dev'
    });

    if (!process.env.CENV_DEFAULTS || alwaysAsk) {
      envVarList.setVars(await ioReadVarList(envVarList));
    }
    if (!envVarList.vars.KMS_KEY && options?.key) {
      const kmsKey = await getKey();
      envVarList.setVars(await ioReadVarList({KMS_KEY: kmsKey}));
    }

    // TODO: cycle through the hosted zones instead of having the user type it in..
    if (!envVarList.vars.ROOT_DOMAIN) {
      const hostedZones = await listHostedZones();
      if (hostedZones && hostedZones.length) {
        const defaultZone = hostedZones.find((hz: HostedZone) => hz.Name && hz.Name.indexOf(defaultRootDomain) > -1)
        if (defaultZone) {
          envVarList.set('ROOT_DOMAIN', defaultZone.Name!);
        } else {
          const recordSetCountSorted = hostedZones.filter((hz: HostedZone) => hz.ResourceRecordSetCount)
                                                  .sort(({ResourceRecordSetCount: a}, {ResourceRecordSetCount: b}) => b as number - (a as number));
          if (recordSetCountSorted.length > 0) {
            envVarList.set('ROOT_DOMAIN', recordSetCountSorted[0].Name!);
          } else {
            envVarList.set('ROOT_DOMAIN', hostedZones[0].Name!);
          }
        }
        const userSelected = await ioReadVarList({ROOT_DOMAIN: envVarList.vars.ROOT_DOMAIN});
        envVarList.set('ROOT_DOMAIN', userSelected.ROOT_DOMAIN);

        // TODO: does the zone they typed appear in our list of available zones?
      }
    }

    if (!existsSync(path.join(process.env.HOME!, '.cenv'))) {
      mkdirSync(path.join(process.env.HOME!, '.cenv'), {recursive: true});
    }
    writeFileSync(profilePath, JSON.stringify(envVarList, null, 2));
    envConfig = envVarList.vars;
  }

  for (const [key, value] of Object.entries(envConfig) as [string, string][]) {
    envVarList.set(key, value);

    if (key === 'AWS_REGION') {
      envVarList.set('CDK_DEFAULT_REGION', value);
    }

    if (key === 'AWS_PROFILE') {
      const awsCredsFile = path.join(process.env.HOME!, '.aws/credentials');
      if (existsSync(awsCredsFile)) {
        const credentials = readFileSync(awsCredsFile, 'utf8')
        const prof = credentials.split(`[${value}]`)[1]?.split('[')[0];
        envVarList.set('AWS_ACCESS_KEY_ID', prof?.split('aws_access_key_id = ')[1]?.split('\n')[0]);
        envVarList.set('AWS_SECRET_ACCESS_KEY', prof?.split('aws_secret_access_key = ')[1]?.split('\n')[0]);
      }
    }
  }

  if (!envVarList.vars.CDK_DEFAULT_ACCOUNT || !envVarList.vars.AWS_ACCOUNT_USER || !envVarList.vars.AWS_ACCOUNT_USER_ARN) {
    const accountInfo: any = await getAccountInfo();
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

  envVarList.set('VITE_APP_ROOT_DOMAIN', envVarList.vars.ROOT_DOMAIN);
  envVarList.set('VITE_APP_ENV', envVarList.vars.ENV);

  writeFileSync(defaultRootDomainPath, envVarList.vars.ROOT_DOMAIN);

  const cidr = await getExportValue('cidr', true);
  if (cidr) {
    envVarList.set('CENV_NETWORK_CIDR', 'cidr')
  }

  // because cdk logs everything to stderr by default.. fucking annoying..
  envVarList.set('CI', 'true')

  if (options?.show) {
    CenvLog.single.infoLog(`${JSON.stringify(envVarList.vars, null, 2)}`);
  }
  return envVarList.vars;
}
