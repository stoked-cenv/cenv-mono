import {EnvVars, getMeta, getValue, pick} from './types';
import { getKey } from './aws/kms';
import path from 'path';
import { CenvFiles } from './file';
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { listHostedZones } from './aws/route53';
import { HostedZone } from '@aws-sdk/client-route-53';
import { getExportValue } from './aws/cloudformation';
import { CenvLog } from './log';
import { getAccountId } from './aws/sts';
import {
  createDirIfNotExists,
  ioReadVarList,
  printProfileQuery,
  ProfileData,
  ioYesOrNo
} from './stdio';
import cliSelect from "@stoked-cenv/cli-select";
import { printItemColumns } from './types/Object';

const primaryProfileProperties: Record<string, any> = {
  CENV_PROFILE: process.env.CENV_PROFILE || '',
  ENV: CenvFiles.ENVIRONMENT || 'dev',
  ROOT_DOMAIN:  process.env.ROOT_DOMAIN,
  AWS_PROFILE: process.env.AWS_PROFILE || 'default',
  AWS_REGION: 'us-east-1',
};
const primaryProfileKeys = Object.keys(primaryProfileProperties);

export interface CenvConfigData {
  CENV_PROFILE: string,
  ENV: string,
  ROOT_DOMAIN: string,
  AWS_PROFILE: string,
  AWS_REGION: string,
}

const delimiter = '↔';

export interface IConfigQuery {
  name?: string;
}
export class ConfigQuery {
  name: string;
  isDefault = false;
  valid = false;
  configData?: CenvConfigData = undefined;

  constructor(query: IConfigQuery) {
    if (!query.name) {
      this.isDefault = true;
      const defaultPath = path.join(CenvFiles.PROFILE_PATH, 'default');
      if (!existsSync(defaultPath)) {
        this.name = '';
        return;
      }
      const defaultProfileData = readFileSync(defaultPath, 'utf8');
      const parsed = JSON.parse(defaultProfileData);
      this.name = parsed && parsed.name ? parsed.name : '';
    } else {
      this.name = query.name;
    }
    if (this.exists) {
      this.valid = true;
    }
    if (this.valid) {
      this.readProfile();
      if (this.configData && !this.configData?.CENV_PROFILE) {
        this.configData.CENV_PROFILE = this.name;
      }
    }
  }

  get path(): string {
    return path.join(CenvFiles.PROFILE_PATH, this.name);
  }

  get exists(): boolean {
    return existsSync(this.path);
  }

  readProfile() {
    this.configData = JSON.parse(readFileSync(this.path, 'utf8'));
  }
}

export class Config {
  query?: ConfigQuery;
  profiles?: ProfileData[];
  envVars?: EnvVars;

  async loadProfile(name: string) {
    this.query = new ConfigQuery({ name });
    this.envVars = new EnvVars(this.query.valid ? { ...this.query.configData } : {}, primaryProfileKeys);
    await this.loadVars(this.envVars);
  }

  async addKey(key?: string) {

  }

  async editProfile(name?: string) {
    this.query = new ConfigQuery({ name });
    const envConfig = this.query.valid ? { ...this.query.configData } : {};
    this.envVars = new EnvVars(envConfig, primaryProfileKeys);
    this.envVars = await this.prompt(this.envVars);
    await this.loadVars(this.envVars);
  }

  async createNewProfile(name?: string) {
    const envConfig = primaryProfileProperties;
    this.envVars = new EnvVars(envConfig, primaryProfileKeys);
    this.envVars = await this.prompt(this.envVars);
    await this.loadVars(this.envVars)
  }

  async show(name?: string) {
    this.query = new ConfigQuery({ name });
    this.envVars = new EnvVars(this.query.valid ? { ...this.query.configData } : {}, primaryProfileKeys);
    await this.loadVars(this.envVars, true);
  }

  async prompt(envVars: EnvVars) {
    const promptVars = pick(envVars.all, ...primaryProfileKeys);

    envVars.setVars(await ioReadVarList(promptVars));

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

    return envVars;
  }

  async loadVars(envVars: EnvVars, show?: boolean) {
    await this.writeProfileData(envVars);
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

    if (!envVars.check('CDK_DEFAULT_ACCOUNT') || !envVars.check('AWS_ACCOUNT_USER') || !envVars.check('AWS_ACCOUNT_USER_ARN')) {
      const accountInfo: any = await this.getAccountInfo();
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

    const cidr = await getExportValue( envVars.get('ENV') + '-cidr', true);
    if (cidr) {
      envVars.set('CENV_NETWORK_CIDR', cidr);
    }

    // because cdk logs everything to stderr by default.. fucking annoying..
    envVars.set('CI', 'true');

    if (show) {
      CenvLog.single.infoLog(`${JSON.stringify(envVars.allSafe, null, 2)}`);
    }
    return envVars.all;
  }

  async loadProfiles(name?: string) {
    const profiles = await this.getProfiles(name, true);
    this.profiles = profiles.sort((a: ProfileData, b: ProfileData) => {
      return a.envConfig.ENV.localeCompare(b.envConfig.ENV) || a.envConfig.AWS_PROFILE.localeCompare(b.envConfig.AWS_PROFILE)
    });
  }

  async manage() {
    await this.loadProfiles(undefined);

    if (!this.profiles) {
      return;
    }
    let selectedIndex = -1;

    this.profiles?.filter((pd: ProfileData, index: number) => {
      if (pd.default) {
        selectedIndex = index;
        return true;
      }
      return false;
    });

    const { alert, alertDim, info, infoBold, infoHighlight, infoDim } = CenvLog.colors;

    let test = 'test';
    const keyFunctions = [
      {
        keys: ['backspace', 'delete'],
        func: (values: any[], selectedValue: any)=> {
          if (values[selectedValue].default) {
            return false;
          }
          if (values[selectedValue].remove) {
            delete values[selectedValue].remove;
          } else {
            values[selectedValue].remove = true;
          }
          return true;
        },
        legend: 'mark profile for deletion'
      },{
        keys: ['space'],
        func: (values: any[], selectedValue: any) => {
          const changed = !values[selectedValue].default;
          for (let i = 0; i < values.length; i++) {
            const selected = selectedValue === i;
            if (selected) {
              values[i].default = true;
              if (values[i].default) {
                delete values[i].remove;
              }
            } else if (values[i].default) {
              delete values[i].default;
            }
          }
          return changed;
        },
        legend: 'select profile as default'
      },{
        keys: ['enter'],
        legend:	 'accept changes and make selected the default profile'
      }
    ];

    const getColors = (data: ProfileData) => {
      const {smoothHighlight, successHighlight, error, errorDim, info, infoBold} = CenvLog.colors;
      let valueColor = smoothHighlight;
      if (data.remove && data.selected) {
        valueColor = error;
      } else if (data.remove) {
        valueColor = errorDim
      } else if (data.selected) {
        valueColor = successHighlight;
      }

      let keyColor = info;
      if (data.selected) {
        keyColor = infoBold;
      }
      return {valueColor, keyColor};
    };

    const keys = ['name', 'envConfig.ENV', 'envConfig.ROOT_DOMAIN', 'envConfig.AWS_PROFILE', 'envConfig.AWS_REGION', 'remove', 'default'];
    const meta = getMeta(this.profiles, keys)
    const onCancel = () =>  CenvLog.single.info('cenv config manage: cancelled');
    const onClose = async (profiles: ProfileData[], originallySelected: number, selectedValue: number) => {
      let anythingUpdated = false;
      let defaultIndex = -1;
      for (let i = 0; i < profiles.length; i++) {
        if (profiles[i].remove) {
          if (!anythingUpdated) {
            console.log(CenvLog.colors.info('profile(s) to be removed:'));
          }
          const colors = getColors(profiles[i]);
          console.log(printItemColumns(profiles[i],  colors, keys ,meta));
          anythingUpdated = true;
        } else if (profiles[i].default) {
          defaultIndex = i;
        }
      }

      if ((originallySelected && !profiles[originallySelected].default) || originallySelected === undefined && defaultIndex !== -1) {
        console.log(CenvLog.colors.info('new default profile:'));
        anythingUpdated = true;
        console.log(printItemColumns(profiles[defaultIndex], getColors(profiles[defaultIndex]), keys, meta));
      }

      if (anythingUpdated) {
        const res = await ioYesOrNo('do you want to save these changes?', 'n');
        if (res) {
          if (defaultIndex !== originallySelected) {
            writeFileSync(path.join(CenvFiles.PROFILE_PATH, 'default'), JSON.stringify({name: profiles[defaultIndex].name}, null, 2));
          }
          for (let i = 0; i < profiles.length; i++) {
            if (profiles[i].remove) {
              rmSync(profiles[i].profilePath);
            }
          }
        }
      }
    }
    const selectedProfile = await cliSelect({
      defaultValue: selectedIndex,
      keyFunctions,
      onCancel,
      onClose,
      legend: true,
      legendColors: {title: alert, keys: alertDim },
      values: this.profiles,
      valueRenderer: (value: any, selected: any) => {
        value.selected = selected;
        return printItemColumns(value, getColors(value), keys, meta);
      },
    });

  }

  /*
  getProfileColumnLengthss(profile: ProfileData, meta: Record<string, number>): Record<string, number> {
    if (!meta['name']) {
      meta['name'] = profile.name.length;
    } else if (meta['name'] < profile.name.length) {
      meta['name'] = profile.name.length;
    }
    for (const key in profile.envConfig) {
      const value = profile.envConfig[key];
      if (!meta[key]) {
        meta[key] = value.length;
      } else if (meta[key] < value.length) {
        meta[key] = value.length;
      }
    }
    return meta;
  }


  printProfileDatas(profile: ProfileData, meta: Record<string, number>, selected: boolean) {
    const {info, smoothHighlight, success, successHighlight, error, errorHighlight, bold} = CenvLog.colors;
    let valueColor = smoothHighlight;
    if (profile?.removed && selected) {
      valueColor = error;
    } else if (profile?.removed) {
      valueColor = errorHighlight
    } else if (selected) {
      valueColor = successHighlight;;
    }

    let output = info(`name: ${valueColor(profile.name.padEnd(meta['name'], ' '))}\t `);
    for (const key in primaryProfileProperties) {
      if (key === 'CENV_PROFILE') {
        continue;
      }
      const value = profile.envConfig[key];
      output += info(`${key}: ${valueColor(value.padEnd(meta[key], ' '))}\t `);
    }
    if (profile?.removed) {
      output += error(`remove`);
    } else if (profile?.default) {
      output += success(`default`);
    }
    return selected ? bold(output) : output;
  }
*/
  async getAccountInfo() {
    const callerIdentity: any = await getAccountId();
    if (!callerIdentity) {
      CenvLog.single.errorLog('could not connect using the configured profile:\n');
      CenvLog.single.errorLog(printProfileQuery(process.env.AWS_PROFILE, CenvFiles.ENVIRONMENT));
      process.exit(2238);
    }
    return {
      CDK_DEFAULT_ACCOUNT: callerIdentity.Account, AWS_ACCOUNT_USER: callerIdentity.User, AWS_ACCOUNT_USER_ARN: callerIdentity.UserArn,
    };
  }

  async writeProfileData(envVars: EnvVars) {
    envVars.add(await this.getAccountInfo());

    const name = envVars.get('CENV_PROFILE')
    const profileData: ProfileData = {
      profilePath: path.join(CenvFiles.PROFILE_PATH, name), askUser: true, name: name, envConfig: {}, default: true, remove: false, selected: false
    };

    const defaultProfilePath = path.join(CenvFiles.PROFILE_PATH, 'default');
    if (profileData?.profilePath !== defaultProfilePath) {
      writeFileSync(defaultProfilePath, JSON.stringify({name}, null, 2));
    }
    envVars.write(profileData?.profilePath, primaryProfileKeys);
  }

  async getProfiles(name?: string, allResults = false, upgrade = false) {
    if (upgrade) {
      allResults = true;
    }
    const profileQuery = this.getProfile(name);
    const defaultQuery = profileQuery === 'default';
    const useQueryMatch = (defaultQuery || name) && !allResults;
    if (useQueryMatch && existsSync(path.join(CenvFiles.PROFILE_PATH, profileQuery))) {
      return [await this.loadCenvProfile(profileQuery)] as ProfileData[];
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
      if (upgrade && fileBase.indexOf(delimiter) !== -1) {
        CenvLog.single.alertLog(`the .cenv profile ${file} appears to have already been upgraded`);
        continue;
      }

      if (reservedFiles.includes(fileBase)) {
        continue;
      }

      if (upgrade) {
        const profConfig: ProfileData = await this.loadCenvProfile(fileBase) as ProfileData;
        matchingProfileFiles.push(profConfig);
        continue;
      } else if (!defaultQuery && ((!name || fileBase.indexOf(name) === -1))) {
        continue;
      }

      const profConfig: ProfileData = await this.loadCenvProfile(fileBase) as ProfileData;
      matchingProfileFiles.push(profConfig);
    }
    if (upgrade || allResults) {
      const defaultProfilePath = path.join(CenvFiles.PROFILE_PATH, 'default');
      if (existsSync(defaultProfilePath)) {
        const defaultMeta = JSON.parse(readFileSync(defaultProfilePath, 'utf8'));
        const defaultProfile = matchingProfileFiles.find((p: ProfileData) => p.name === defaultMeta.name);
        if (defaultProfile) {
          defaultProfile.default = true;
        }
      }
    }
    return matchingProfileFiles;
  }


  getProfile(name?: string) {
    if (!name) {
      return 'default';
    }
    return `${name ? name : ''}`;
  }


  async loadCenvProfile(profileFileName = 'default', options?: Record<string, any>) {
    let envConfig;
    const profilePath = path.join(CenvFiles.PROFILE_PATH, profileFileName);
    let alwaysAsk = false;
    if (existsSync(profilePath)) {
      envConfig = JSON.parse(readFileSync(profilePath, 'utf8'));
    } else if (options?.show) {
      CenvLog.single.alertLog(`no configuration currently setup to show run '${CenvLog.colors.alertBold('cenv configure')}'`);
      process.exit(231);
    } else {
      alwaysAsk = true;
    }

    return { envConfig, profilePath, name: profileFileName, askUser: alwaysAsk };
  }
}
