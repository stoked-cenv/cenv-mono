import * as path from 'path';
import {BaseCommandOptions} from './params'
import {CenvLog, colors} from './log.service';
import {existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync} from 'fs';
import {inputArgsToEnvVars} from "./utils";
import {CenvFiles} from "./file";
import read from './read';

export async function readAsync(prompt: string, defaultValue: string): Promise<string> {
  try {
    const finalPrompt = `${prompt}:`;
    return await read({prompt: finalPrompt, default: `${colors.success(defaultValue)}`},);
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
        CenvLog.single.infoLog(`${colors.infoBold(prompt)}: ${colors.infoBold(defaultValue)}(read-only)`)
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
    CenvLog.single.errorLog(`This application is already initialized. Run "${colors.errorBold('cenv init --force')}" to reset the application to start from scratch.`);
    return;
  }
  application = await ioReadVar('application name', application.value, application.defaultValue, defaults);
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
  const answer = await readAsync(colors.alert(`${prompt} (y/${colors.success('n')})`), defaultValue,);
  if (answer === 'y') {
    return true;
  }
  return false;
}

export function getContextConfig() {
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

export function printProfileQuery(profile?: string, environment?: string) {
  if (!profile && !environment) {
    return `the profile query contains neither a profile or an environment`;
  }
  return `${profile ? `profile: ${colors.alertBold(profile)} ` : ''}${environment ? `environment: ${colors.alertBold(environment)} ` : ''}`;
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
  const getFile = () => {
    if (profile === '' && environment === '') {
      return 'default';
    }
    return `${profile}↔${environment}`
  }
  const filename = getFile();
  const reservedFiles = ['localstack-api-key', 'default-root-domain']

  createDirIfNotExists(CenvFiles.PROFILE_PATH);

  const list = readdirSync(CenvFiles.PROFILE_PATH);
  const matchingProfileFiles: ProfileData[] = [];
  for (let i = 0; i < list.length; i++) {
    const file = list[i];
    const stat = statSync(path.join(CenvFiles.PROFILE_PATH, file));
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
    profilePath: `${path.join(CenvFiles.PROFILE_PATH, 'default')}`, askUser: true
  };
}

export async function loadCenvProfile(filename: string, options?: Record<string, any>,) {
  let envConfig;
  let profilePath;

  if (filename) {
    profilePath = path.join(CenvFiles.PROFILE_PATH, filename);
  } else {
    profilePath = path.join(CenvFiles.PROFILE_PATH, `default`)
  }
  let alwaysAsk = false;
  if (existsSync(profilePath)) {
    envConfig = JSON.parse(readFileSync(profilePath, 'utf8'));
  } else if (options?.show) {
    CenvLog.single.alertLog(`no configuration currently setup to show run '${colors.alertBold('cenv configure')}'`);
    process.exit(231);
  } else {
    alwaysAsk = true;
  }

  return {envConfig, profilePath, askUser: alwaysAsk};
}
