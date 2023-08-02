import { EnvVars, pick } from './types';
import { getKey } from './aws/kms';
import path from 'path';
import { CenvFiles } from './file';
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { listHostedZones } from './aws/route53';
import { HostedZone } from '@aws-sdk/client-route-53';
import { getExportValue } from './aws/cloudformation';
import { CenvLog, colors } from './log';
import { getAccountId } from './aws/sts';
import { createDirIfNotExists, getContextConfig, ioReadVarList, printProfileQuery, ProfileData } from './stdio';

const primaryProfileProperties: Record<string, any> = {
  AWS_PROFILE: process.env.AWS_PROFILE || 'default', AWS_REGION: 'us-east-1', ENV: process.env.ENV || 'dev', ROOT_DOMAIN: undefined,
};
const primaryProfileKeys = Object.keys(primaryProfileProperties);

export async function Config(options: any, alwaysAsk = false) {
  // verify that we need a config at all
  if (!alwaysAsk) {
    const contextConfig = getContextConfig();
    if (contextConfig) {
      return contextConfig;
    }
  }
  const profiles = await getProfiles(options?.profile, options?.env);
  if (profiles.length > 1) {
    CenvLog.single.alertLog(`Multiple profiles match your query - ${printProfileQuery(options?.profile, options?.env)}\n\nPlease specify both the profile and the environment options. The following are the matching profiles:\n\n`);
    profiles.forEach((profileData: ProfileData) => {
      CenvLog.single.stdLog(printProfileQuery(profileData.envConfig?.AWS_PROFILE, profileData.envConfig?.ENV, profileData.profilePath));
    });
    process.exit(336);
  }
  const profileData = profiles.length ? profiles[0] : undefined;
  const envConfig = (profileData && profileData?.envConfig) ? { ...profileData.envConfig } : {};
  const envVars = new EnvVars(envConfig, primaryProfileKeys);

  const ask = !profileData?.envConfig || (alwaysAsk && !options?.show);
  envVars.setVars(profileData?.envConfig || primaryProfileProperties);

  if (ask || !profileData) {
    await profileDataPrompt(envVars, options);
  } else {
    envVars.add(await getAccountInfo());
  }

  const awsCredsFile = path.join(process.env.HOME!, '.aws/credentials');
  if (existsSync(awsCredsFile)) {
    const credentials = readFileSync(awsCredsFile, 'utf8');
    const prof = credentials.split(`[${envVars.get('AWS_PROFILE')}]`)[1]?.split('[')[0];
    envVars.set('AWS_ACCESS_KEY_ID', prof?.split('aws_access_key_id = ')[1]?.split('\n')[0]);
    envVars.set('AWS_SECRET_ACCESS_KEY', prof?.split('aws_secret_access_key = ')[1]?.split('\n')[0]);
  }

  for (const [key, value] of Object.entries(envVars.all) as [string, string][]) {
    envVars.set(key, value);

    if (key === 'AWS_REGION') {
      envVars.set('CDK_DEFAULT_REGION', value);
    }
  }

  if (!envVars.get('CDK_DEFAULT_ACCOUNT') || !envVars.get('AWS_ACCOUNT_USER') || !envVars.get('AWS_ACCOUNT_USER_ARN')) {
    const accountInfo: any = await getAccountInfo();
    if (!accountInfo) {
      process.exit(9);
    } else {
      envVars.add(accountInfo);
    }
  }

  if (!process.env['KMS_KEY']) {
    const kmsKey = await getKey();
    if (kmsKey) {
      envVars.set('KMS_KEY', kmsKey);
    }
  }

  const cidr = await getExportValue('cidr', true);
  if (cidr) {
    envVars.set('CENV_NETWORK_CIDR', 'cidr');
  }

  // because cdk logs everything to stderr by default.. fucking annoying..
  envVars.set('CI', 'true');

  if (options?.show) {
    CenvLog.single.infoLog(`${JSON.stringify(envVars.allSafe, null, 2)}`);
  }
  return envVars.all;
}

export async function ListConfigs(options?: any) {
  const profileData = await getProfiles(options?.profile, options?.env, true);
  const lengthSorted = profileData.sort((a: ProfileData, b: ProfileData) => {
    return b.envConfig.AWS_PROFILE.length - a.envConfig.AWS_PROFILE.length;
  })
  if (profileData.length) {
    const length = lengthSorted[0].envConfig.AWS_PROFILE.length;
    profileData.map((pd: ProfileData) => {
      console.log(printProfileQuery(pd.envConfig.AWS_PROFILE.padEnd(length), pd.envConfig.ENV, pd.profilePath));
    });
  } else {
    console.log('no cenv profiles were found');
  }
}

function removeProfile(path: string, profile?: string, env?: string, silent?: boolean) {
  let silentOutput = silent ? silent : true;
  let defaultProfile = false;
  if (!profile && !env) {
    defaultProfile = true;
  }
  if (!silentOutput) {
    CenvLog.single.infoLog(`removing - ${printProfileQuery(profile, env, path)}`);
  }
  rmSync(path);
}

export async function RemoveConfig(options?: any) {
  const profile = getProfile(options?.profile, options?.env);
  let profilePath = path.join(CenvFiles.PROFILE_PATH, profile);
  if (profile === 'default') {
    if (!options?.default) {
      CenvLog.single.errorLog('the default flag must be passed in to remove the default profile');
      process.exit(990);
    }
    const envConfig = JSON.parse(readFileSync(profilePath, 'utf8'));
    removeProfile(profilePath, options?.profile, options?.env);
    const realProfilePath = getProfilePath(envConfig.AWS_PROFILE, envConfig.ENV);
    if (existsSync(realProfilePath)) {
      removeProfile(getProfilePath(envConfig.AWS_PROFILE, envConfig.ENV), envConfig.AWS_PROFILE, envConfig.ENV, false);
    }
  } else {
    if (options?.default) {
      CenvLog.single.errorLog('the default flag can only be passed in without the --profile and --env options');
      process.exit(999);
    }
    const profileData = await getProfiles(options?.profile, options?.env);
    if (!profileData.length) {
      CenvLog.single.alertLog('could not find any cenv profiles that matched the query - ' + printProfileQuery(options?.profile, options?.env));
      process.exit(337);
    }
    const defaultProfilePath = getProfilePath();
    const defaultConfig = JSON.parse(readFileSync(defaultProfilePath, 'utf8'));
    profileData.forEach((pd: ProfileData) => {
      if (pd.envConfig.AWS_PROFILE === defaultConfig.AWS_PROFILE && pd.envConfig.ENV === defaultConfig.ENV) {
        CenvLog.single.alertLog(`skipping profile: ${defaultConfig.AWS_PROFILE} env: ${defaultConfig.ENV}\n - the --default flag must be passed in to remove the default profile`);
      } else {
        profilePath = pd.profilePath;
        removeProfile(profilePath, pd.envConfig.AWS_PROFILE, pd.envConfig.ENV);
      }
    });
  }
}

async function profileDataPrompt(envVars: EnvVars, options?: Record<string, any>) {
  const promptVars = pick(envVars.all, ...primaryProfileKeys);
  if (options?.profile) {
    delete promptVars.AWS_PROFILE;
  }
  if (options?.env) {
    delete promptVars.ENV;
  }
  envVars.setVars(await ioReadVarList(promptVars));
  if (options?.profile) {
    envVars.set('AWS_PROFILE', options.profile);
  }
  if (options?.env) {
    envVars.set('ENV', options.env);
  }

  if (!envVars.check('KMS_KEY') && options?.key) {
    const kmsKey = await getKey();
    envVars.setVars(await ioReadVarList({ KMS_KEY: kmsKey }));
  }

  // TODO: cycle through the hosted zones instead of having the user type it in..
  if (!envVars.check('ROOT_DOMAIN')) {
    const defaultRootDomainPath = path.join(CenvFiles.PROFILE_PATH, `default-root-domain`);
    let defaultRootDomain: string | undefined = undefined;
    if (existsSync(defaultRootDomainPath)) {
      defaultRootDomain = readFileSync(defaultRootDomainPath, 'utf8');
    }

    const hostedZones = await listHostedZones();
    if (hostedZones && hostedZones.length) {
      let domain: string | undefined = undefined;
      if (defaultRootDomain !== undefined) {
        const defaultZone = hostedZones.find((hz: HostedZone) => hz.Name && hz.Name.indexOf(defaultRootDomain as string) > -1);
        if (defaultZone) {
          domain = defaultZone.Name!.slice(0, -1);
        }
      } else if (!domain) {
        const recordSetCountSorted = hostedZones.filter((hz: HostedZone) => hz.ResourceRecordSetCount)
                                                .sort(({ ResourceRecordSetCount: a }, { ResourceRecordSetCount: b }) => b as number - (a as number));
        if (recordSetCountSorted.length > 0) {
          domain = recordSetCountSorted[0].Name!.slice(0, -1);
        } else {
          domain = hostedZones[0].Name!.slice(0, -1);
        }
      }
      const userSelected = await ioReadVarList({ ROOT_DOMAIN: domain });
      envVars.set('ROOT_DOMAIN', userSelected.ROOT_DOMAIN);
      writeFileSync(defaultRootDomainPath, userSelected.ROOT_DOMAIN);
      // TODO: does the zone they typed appear in our list of available zones?
    }
  }
  await writeProfileData(envVars);
  return envVars;
}

async function getAccountInfo() {
  const callerIdentity: any = await getAccountId();
  if (!callerIdentity) {
    CenvLog.single.errorLog('could not connect using the configured profile:\n');
    CenvLog.single.errorLog(printProfileQuery(process.env.AWS_PROFILE, process.env.ENV));
    process.exit(2238);
  }
  return {
    CDK_DEFAULT_ACCOUNT: callerIdentity.Account, AWS_ACCOUNT_USER: callerIdentity.User, AWS_ACCOUNT_USER_ARN: callerIdentity.UserArn,
  };
}

async function writeProfileData(envVars: EnvVars) {
  envVars.add(await getAccountInfo());

  const name = getProfile(envVars.get('AWS_PROFILE'), envVars.get('ENV'));
  const profileData: ProfileData = {
    profilePath: path.join(CenvFiles.PROFILE_PATH, name), askUser: true, name: name, envConfig: {},
  };

  const defaultProfilePath = path.join(CenvFiles.PROFILE_PATH, 'default');
  if (profileData?.profilePath !== defaultProfilePath) {
    envVars.write(defaultProfilePath, primaryProfileKeys);
  }
  CenvLog.single.infoLog(`write profile: ${name} - ${profileData?.profilePath}`);
  envVars.write(profileData?.profilePath, primaryProfileKeys);
}

export async function getProfiles(profile?: string, environment?: string, allResults = false, upgrade = false) {
  if (upgrade) {
    allResults = true;
  }
  const profileQuery = getProfile(profile, environment);
  const defaultQuery = profileQuery === 'default';
  const useQueryMatch = (defaultQuery || profile && environment) && !allResults;
  if (useQueryMatch && existsSync(path.join(CenvFiles.PROFILE_PATH, profileQuery))) {
    return [await loadCenvProfile(profileQuery)] as ProfileData[];
  }

  const reservedFiles = ['default', 'localstack-api-key', 'default-root-domain'];

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
    if (upgrade && fileBase.indexOf('↔') !== -1) {
      CenvLog.single.alertLog(`the .cenv profile ${file} appears to have already been upgraded`);
      continue;
    }

    if (reservedFiles.includes(fileBase)) {
      continue;
    }

    if (upgrade) {
      const profConfig: ProfileData = await loadCenvProfile(fileBase) as ProfileData;
      matchingProfileFiles.push(profConfig);
      continue;
    } else if (!defaultQuery && ((!profile || fileBase.indexOf(profile) === -1) && (!environment || fileBase.indexOf(environment) === -1))) {
      continue;
    }

    const profConfig: ProfileData = await loadCenvProfile(fileBase) as ProfileData;
    matchingProfileFiles.push(profConfig);
  }
  if (upgrade) {
    const profConfig: ProfileData = await loadCenvProfile('default') as ProfileData;
    matchingProfileFiles.push(profConfig);
  }
  return matchingProfileFiles;
}

function getProfile(profile?: string, env?: string) {
  if (!profile && !env) {
    return 'default';
  }
  return `${profile ? profile : ''}↔${env ? env : ''}`;
}

function getProfilePath(profile?: string, env?: string) {
  return path.join(CenvFiles.PROFILE_PATH, getProfile(profile, env));
}

export function exitNoMatchingProfiles(profile?: string, environment?: string): never {
  CenvLog.single.alertLog(`No profiles matched the query: ${printProfileQuery(profile, environment)}`);
  process.exit(0);
}

async function loadCenvProfile(profileName = 'default', options?: Record<string, any>) {
  let envConfig;
  const profilePath = path.join(CenvFiles.PROFILE_PATH, profileName);
  let alwaysAsk = false;
  if (existsSync(profilePath)) {
    envConfig = JSON.parse(readFileSync(profilePath, 'utf8'));
  } else if (options?.show) {
    CenvLog.single.alertLog(`no configuration currently setup to show run '${colors.alertBold('cenv configure')}'`);
    process.exit(231);
  } else {
    alwaysAsk = true;
  }

  return { envConfig, profilePath, name: profileName, askUser: alwaysAsk };
}

