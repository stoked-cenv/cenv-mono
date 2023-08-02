import * as path from 'path';
import { CenvLog, colors } from './log';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'fs';
import { inputArgsToEnvVars, printConfigurationExports } from './utils';
import { CenvFiles } from './file';
import Mute from 'mute-stream'
import { createInterface, ReadLineOptions } from 'readline'
import { hostname } from 'os';

export interface ProfileData {
  envConfig: Record<string, string>,
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


async function read<T extends string | number = string>({
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

export async function readAsync(prompt: string, defaultValue: string): Promise<string> {
  try {
    const finalPrompt = `${prompt}:`;
    return await read({ prompt: finalPrompt, default: `${colors.success(defaultValue)}` });
  } catch (e) {
    CenvLog.single.catchLog(`readAsync error:\nError: ${e as string}`);
    process.exit(99);
  }
}

function cleanString(input: string) {
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

export async function  ioReadVar(prompt: string, varValue: string | undefined, defaultValue: string, defaults = false, protectedMode = false): Promise<string> {
  if (!varValue) {
    if (!defaults) {
      if (protectedMode && defaultValue.match(/^<\].*?\[>$/)?.length) {
        CenvLog.single.infoLog(`${colors.infoBold(prompt)}: ${colors.infoBold(defaultValue)}(read-only)`);
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

  return { application, environment };
}

export async function ioReadVarList(keyValueList: any, protectedMode = false): Promise<Record<string, string>> {
  for (const [key, value] of Object.entries(keyValueList)) {
    const output = await ioReadVar(key, undefined, value as string, process.env.CENV_DEFAULTS ? true : false, protectedMode);
    keyValueList[key] = output;
  }
  return keyValueList;
}

export async function ioYesOrNo(prompt = 'Are you sure?', defaultValue = 'n'): Promise<boolean> {
  const answer = await readAsync(colors.alert(`${prompt} (y/${colors.success('n')})`), defaultValue);
  if (answer === 'y') {
    return true;
  }
  return false;
}

export function getContextConfig() {
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

export function printProfileQuery(profile?: string, environment?: string, profilePath?: string, defaultProfile = false) {
  if (!profile && !environment && !profilePath) {
    return `the profile query contains neither a profile or an environment`;
  } else if (defaultProfile) {
    if (!profilePath) {
      profilePath = path.join(CenvFiles.PROFILE_PATH, 'default')
    }
    return `cenv default profile -${` path: ${colors.alertBold(profilePath.replace(process.env.HOME!, '~'))}`}`;
  }
  return `${profile ? `profile: ${colors.alertBold(profile)}\t` : ''}${environment ? `env: ${colors.alertBold(environment)}\t` : ''}${profilePath ? `path: ${colors.alertBold(profilePath.replace(process.env.HOME!, '~'))} ` : ''}`;
}

export function createDirIfNotExists(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path);
  }
}

function printApp(cmd: string, envVars: Record<string, string>, cenvVars: Record<string, string>) {
  let envVarDisplay;
  if (envVars && Object.keys(envVars).length) {
    envVarDisplay = inputArgsToEnvVars(envVars);
    envVarDisplay = envVarDisplay.replace(/AWS_ACCESS_KEY_ID=(\S*)/, 'AWS_ACCESS_KEY_ID=[***]',);
    envVarDisplay = envVarDisplay.replace(/AWS_SECRET_ACCESS_KEY=(\S*)/, 'AWS_SECRET_ACCESS_KEY=[***]',);
    envVarDisplay = ' ' + envVarDisplay;
  } else {
    printConfigurationExports();
  }

  const consoleFolder = process.cwd().split('/').pop();
  const cons = `${hostname()}:${consoleFolder} ${process.env.USER}$`;
  if (envVarDisplay && envVarDisplay.trim().length > 0) {
    CenvLog.single.infoLog(envVarDisplay ? envVarDisplay
    .split(' ')
    .join(colors.info(`\n`) + `export `)
    .replace('\n', '') : '',);
  }

  if (Object.keys(cenvVars).length) {
    let configVarDisplay = inputArgsToEnvVars(cenvVars);
    configVarDisplay = ' ' + configVarDisplay;
    CenvLog.single.infoLog('# cenv config vars');
    CenvLog.single.infoLog(configVarDisplay ? configVarDisplay
    .split(' ')
    .join(colors.info(`\n`) + `export `)
    .replace('\n', '') : '',);
  }

  console.log(`${colors.info(`${cons} `)}${colors.infoBold(cmd)}`);
}
