import * as path from 'path';
import { CenvLog, colors } from './log.service';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'fs';
import { inputArgsToEnvVars } from './utils';
import { CenvFiles } from './file';
import Mute from 'mute-stream'
import { createInterface, ReadLineOptions } from 'readline'

export interface ProfileData {
  envConfig?: Record<string, string>,
  profilePath: string,
  askUser: boolean,
  exactMatch?: boolean,
  name: string
}

namespace Read {
  export interface Options<T extends string | number = string> {
    default?: T
    input?: ReadLineOptions['input'] & {
      isTTY?: boolean
    }
    output?: ReadLineOptions['output'] & {
      isTTY?: boolean
    }
    prompt?: string
    silent?: boolean
    timeout?: number
    edit?: boolean
    terminal?: boolean
    replace?: string
  }
}

export class CenvStdio {

  async read<T extends string | number = string>({
                                                   default: def,
                                                   input = process.stdin,
                                                   output = process.stdout,
                                                   prompt = '',
                                                   silent,
                                                   timeout,
                                                   edit,
                                                   terminal,
                                                   replace,
                                                 }: Read.Options<T>): Promise<T | string> {
  if (typeof def !== 'undefined' && typeof def !== 'string' && typeof def !== 'number') {
    throw new Error('default value must be string or number');
  }

  let editDef = false
  prompt = prompt.trim() + ' '
  terminal = !!(terminal || output.isTTY)

  if (def) {
    if (silent) {
      prompt += '(<default hidden>) '
      /* c8 ignore start */
    } else if (edit) {
      editDef = true
      /* c8 ignore stop */
    } else {
      prompt += '(' + def + ') '
    }
  }

  const m = new Mute({ replace, prompt })
  m.pipe(output, { end: false })
  output = m

  return new Promise<string | T>((resolve, reject) => {
      const rl = createInterface({ input, output, terminal })
      /* c8 ignore start */
      const timer =
        timeout && setTimeout(() => onError(new Error('timed out')), timeout)
      /* c8 ignore stop */

      m.unmute()
      rl.setPrompt(prompt)
      rl.prompt()

      if (silent) {
        m.mute()
        /* c8 ignore start */
      } else if (editDef) {
        //@ts-ignore
        rl.line = def
        //@ts-ignore
        rl.cursor = def.length
        //@ts-ignore
        rl._refreshLine()
      }
      /* c8 ignore stop */

      const done = () => {
        rl.close()
        clearTimeout(timer)
        m.mute()
        m.end()
      }

      /* c8 ignore start */
      const onError = (er: Error) => {
        done()
        reject(er)
      }
      /* c8 ignore stop */

      rl.on('error', onError)
      rl.on('line', line => {
        /* c8 ignore start */
        if (silent && terminal) {
          m.unmute()
          m.write('\r\n')
        }
        /* c8 ignore stop */
        done()
        // truncate the \n at the end.
        /* c8 ignore start */
        return resolve(line.replace(/\r?\n$/, '') || def || '')
        /* c8 ignore stop */
      })

      /* c8 ignore start */
      rl.on('SIGINT', () => {
        rl.close()
        onError(new Error('canceled'))
      })
      /* c8 ignore stop */
    })
  }

  async readAsync(prompt: string, defaultValue: string): Promise<string> {
    try {
      const finalPrompt = `${prompt}:`;
      return await this.read({ prompt: finalPrompt, default: `${colors.success(defaultValue)}` });
    } catch (e) {
      CenvLog.single.catchLog(`readAsync error:\nError: ${e as string}`);
      process.exit(99);
    }
  }

  cleanString(input: string) {
    // eslint-disable-next-line no-control-regex
    return input.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
  }

  async ioReadVar(prompt: string, varValue: string | undefined, defaultValue: string, defaults = false, protectedMode = false): Promise<string> {
    if (!varValue) {
      if (!defaults) {
        if (protectedMode && defaultValue.match(/^<\].*?\[>$/)?.length) {
          CenvLog.single.infoLog(`${colors.infoBold(prompt)}: ${colors.infoBold(defaultValue)}(read-only)`);
          varValue = defaultValue;
        } else {
          varValue = await this.readAsync(prompt, defaultValue);
        }
      } else {
        varValue = defaultValue;
      }
    }
    return this.cleanString(varValue);
  }

  async ioAppEnv(config: any, application: any, environment: any, overwrite = false, defaults = false) {
    if (config?.ConfigurationId && !overwrite) {
      CenvLog.single.errorLog(`This application is already initialized. Run "${colors.errorBold('cenv init --force')}" to reset the application to start from scratch.`);
      return;
    }
    application = await this.ioReadVar('application name', application.value, application.defaultValue, defaults);
    environment = await this.ioReadVar('environment name', environment.value, environment.defaultValue, defaults);

    return { application, environment };
  }

  async ioReadVarList(keyValueList: any, protectedMode = false): Promise<Record<string, string>> {
    for (const [key, value] of Object.entries(keyValueList)) {
      const output = await this.ioReadVar(key, undefined, value as string, process.env.CENV_DEFAULTS ? true : false, protectedMode);
      keyValueList[key] = output;
    }
    return keyValueList;
  }

  async ioYesOrNo(prompt = 'Are you sure?', defaultValue = 'n'): Promise<boolean> {
    const answer = await this.readAsync(colors.alert(`${prompt} (y/${colors.success('n')})`), defaultValue);
    if (answer === 'y') {
      return true;
    }
    return false;
  }

  getContextConfig() {
    const {
      AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, ROOT_DOMAIN, CDK_DEFAULT_ACCOUNT, CDK_DEFAULT_REGION, ENV,
    } = process.env;
    if (AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY && AWS_REGION && ROOT_DOMAIN && CDK_DEFAULT_ACCOUNT && CDK_DEFAULT_REGION && ENV) {
      const args = {
        AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, ROOT_DOMAIN, CDK_DEFAULT_ACCOUNT, CDK_DEFAULT_REGION, ENV,
      };
      process.env.CENV_CONFIGURE = inputArgsToEnvVars(args);
      return args;
    }
    return false;
  }

  static printProfileQuery(profile?: string, environment?: string, path?: string, ) {
    if (!profile && !environment && !path) {
      return `the profile query contains neither a profile or an environment`;
    }
    return `${profile ? `profile: ${colors.alertBold(profile)} ` : ''}${environment ? `environment: ${colors.alertBold(environment)} ` : ''}${environment ? `path: ${colors.alertBold(path)} ` : ''}`;
  }

  static createDirIfNotExists(path: string) {
    if (!existsSync(path)) {
      mkdirSync(path);
    }
  }

  async getProfiles(paramMatchesOnly = false, profile?: string, environment?: string) {

    const profileName = CenvStdio.getProfile(profile, environment);
    const useFile = profileName === 'default' || profile && environment;
    if (useFile && paramMatchesOnly && existsSync(path.join(CenvFiles.PROFILE_PATH, profileName))) {
      return [await this.loadCenvProfile(profileName)] as ProfileData[];
    }

    const reservedFiles = ['localstack-api-key', 'default-root-domain'];

    CenvStdio.createDirIfNotExists(CenvFiles.PROFILE_PATH);

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
        const profConfig: ProfileData = await this.loadCenvProfile(fileBase) as ProfileData;
        matchingProfileFiles.push(profConfig);
        continue;
      } else if (fileBase.indexOf(profileName) === -1) {
        continue;
      }

      const profConfig: ProfileData = await this.loadCenvProfile(fileBase) as ProfileData;
      matchingProfileFiles.push(profConfig);
    }
    return matchingProfileFiles;
  }

  static getProfile(profile?: string, env?: string) {
    if (!profile && !env) {
      return 'default';
    }
    return `${profile}↔${env}`;
  }

  static getProfilePath(profile?: string , env?: string) {
    return path.join(CenvFiles.PROFILE_PATH, this.getProfile(profile, env))
  }

  async getMatchingProfileConfig(exactMatch: boolean, profile?: string, environment?: string): Promise<ProfileData | undefined> {
    const matchingProfileFiles: ProfileData[] = await this.getProfiles(exactMatch, profile, environment);
    if (matchingProfileFiles.length === 1) {
      matchingProfileFiles[0].exactMatch = true;
      return matchingProfileFiles[0];
    } else if (matchingProfileFiles.length > 1) {
      CenvLog.single.alertLog(`Multiple profiles match your query - ${CenvStdio.printProfileQuery(profile, environment, matchingProfileFiles[0].profilePath)}.\n\nPlease specify both the profile and the environment options. The following are the matching profiles:\n\n`);
      matchingProfileFiles.forEach((profileData) => {
        CenvLog.single.stdLog(CenvStdio.printProfileQuery(profileData.envConfig?.AWS_PROFILE, profileData.envConfig?.ENV, profileData.profilePath));
      });
      process.exit(0);
    } else if (!exactMatch) {
      CenvStdio.exitNoMatchingProfiles(profile, environment);
    }
  }
  static exitNoMatchingProfiles(profile?: string, environment?: string): never {
    CenvLog.single.alertLog(`No profiles matched the query: ${CenvStdio.printProfileQuery(profile, environment)}`);
    process.exit(0);
  }

  async loadCenvProfile(profileName = 'default', options?: Record<string, any>) {
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

}