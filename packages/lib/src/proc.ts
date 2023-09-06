import { PackageModule } from './package/module';
import { CommandEvents, Package, PackageCmd } from './package/package';
import { inputArgsToEnvVars, printConfigurationExports } from './utils';
import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { ClientMode, startCenv } from './aws/appConfigData';
import { hostname } from 'os';
import child from 'child_process';
import { Cenv } from './cenv';
import { CenvFiles } from './file';
import { deleteCenvData } from './aws/appConfig';
import {  CenvLog } from './log'

export async function runScripts(pkgModule: PackageModule, scripts: (string | { exec: string, options: object })[] | undefined) {
  if (scripts) {
    for (let i = 0; i < scripts.length; i++) {
      const script: any = scripts[i];
      if (typeof script === "string") {
        await spawnCmd(pkgModule.path, script as string, script as string, {}, pkgModule.pkg);
      } else {
        const metaScript = script as { exec: string, options: object };
        await spawnCmd(pkgModule.path, metaScript.exec, metaScript.exec, metaScript.options, pkgModule.pkg);
      }
    }
  }
}

function spawnInfo(options: any, chunk: string, output: string) {
  // match cdk status output

  if (options.returnOutput) {
    output += chunk;
  }  else {
    options.pkgCmd?.info(chunk);
  }
}

function log(options: any, cmdLog?: PackageCmd, packageInfo?: Package, ...text: string[]) {
  if (options.silent) {
    return;
  }
  if (cmdLog) {
    text.unshift('cmdLog');
    cmdLog.info(...text);
  } else if (packageInfo) {
    text.unshift('packageInfo');
    packageInfo.info(...text);
  } else if (!options.silent) {
    text.unshift('infoLog');
    CenvLog.single.infoLog(text)
  }
}

export async function spawn(cmd: string) {
  await spawnCmd('./', cmd);
}

function err(errors: string[], options: any, cmdLog?: PackageCmd, packageInfo?: Package, ...text: string[]) {
  errors = errors.concat(text)
  if (options.silent) {
    return;
  } else if (cmdLog) {
    cmdLog.err(...text);
  } else if (packageInfo) {
    packageInfo.err(...text);
  } else if (!options.silent) {
    CenvLog.single.errorLog(text)
  }
  return {errors};
}

function spawnErr(chunk: string, options: any, errors: string[], output: string, cmdLog?: PackageCmd, pkg?: Package) {
  if (options?.redirectStdErrToStdOut) {
    const actualErrors = new RegExp(/ERROR/, 'i').exec(chunk);
    if (!actualErrors) {
      spawnInfo(options, chunk, output);
    } else {
      err(errors, options, cmdLog, pkg, chunk)
    }
  } else {
    err(errors, options, cmdLog, pkg, chunk)
  }
}

function handleErrors(errors: string[], packageInfo?: Package) {
  if (errors.length) {
    errors.forEach((err: string) => {
      if (packageInfo) {
        packageInfo.err('err handleErrors()' + err);
      } else {
        CenvLog.single.errorLog('err handleErrors()' + err);
      }
    })
  }
}

export interface ICmdOptions {
  envVars?: any;
  cenvVars?: any;
  detached?: boolean;
  waitSeconds?: number;
  waitForOutput?: string;
  stdio?: child.StdioOptions;
  getCenvVars?: boolean;
  output?: boolean;
  stdin?: any;
  failOnError?: boolean;
  returnOutput?: boolean;
  redirectStdErrToStdOut?: boolean;
  pipedOutput?: boolean;
  pkgCmd?: PackageCmd;
  silent?: boolean;
  commandEvents?: CommandEvents;
}

export async function spawnCmd(folder: string, cmd: string, name?: string, options: ICmdOptions = {
  envVars: {},
  cenvVars: {},
  detached: false,
  waitSeconds: 0,
  waitForOutput: undefined,
  stdio: 'inherit',
  getCenvVars: false,
  stdin: undefined,
  failOnError: true,
  returnOutput: false,
  redirectStdErrToStdOut: false,
  pipedOutput: false,
  commandEvents: undefined
}, packageInfo?: Package): Promise<any> {

  if (cmd.length === 0) {
    process.exit(45);
  }
  let cmdLog = options.pkgCmd;
  if (packageInfo && !cmdLog && !options.silent) {
    cmdLog = packageInfo.createCmd(cmd);
  }

  //packageInfo.alert('options', JSON.stringify(options, null, 2))


  const errors: any = [];
  try {
    if (options.commandEvents?.preCommandFunc) {
      await options.commandEvents.preCommandFunc();
    }

    const relativeDir = path.relative(process.cwd(), path.resolve(folder));
    const newCwd: string = './' + relativeDir;
    if (relativeDir !== '') {
      process.chdir(newCwd);
    }

    let configVarDisplay: string;
    let configVars: any = {};
    if (options.getCenvVars && !packageInfo) {
      const useCurrentDirectory = existsSync('.cenv');
      const useParentDirectory = useCurrentDirectory ? false : existsSync('../.cenv');
      const skipCenv = !useCurrentDirectory && !useParentDirectory;
      if (!skipCenv) {
        const appName = useCurrentDirectory ? require('./package.json').name : require('../package.json').name;
        configVars = await startCenv(ClientMode.REMOTE_ON_STARTUP, appName, '0 * * * *', true);
        if (Object.keys(configVars).length) {
          configVarDisplay = inputArgsToEnvVars(configVars);
          configVarDisplay = ' ' + configVarDisplay;
        }
      }
      if (useParentDirectory) {
        process.chdir('../');
      }

      if (useParentDirectory) {
        process.chdir('./deploy');
      }
    }
    return new Promise((resolve, reject) => {
      let envVarDisplay;
      if (!packageInfo) {
        if (options?.envVars && Object.keys(options?.envVars).length) {
          envVarDisplay = inputArgsToEnvVars(options?.envVars);
          envVarDisplay = envVarDisplay.replace(/AWS_ACCESS_KEY_ID=(\S*)/, 'AWS_ACCESS_KEY_ID=[***]',);
          envVarDisplay = envVarDisplay.replace(/AWS_SECRET_ACCESS_KEY=(\S*)/, 'AWS_SECRET_ACCESS_KEY=[***]',);
          envVarDisplay = ' ' + envVarDisplay;
        } else {
          printConfigurationExports();
        }
      }
      options.envVars = {
        ...options.envVars, ...configVars, ...process.env, ...options.cenvVars, FORCE_COLOR: 1,
      };

      process.env.FORCE_COLOR = '1';
      const consoleFolder = process.cwd().split('/').pop();
      const cons = `${hostname()}:${consoleFolder} ${process.env.USER}$`;
      if (!packageInfo) {
        if (envVarDisplay && envVarDisplay.trim().length > 0) {
          log(options, cmdLog, packageInfo, envVarDisplay ? envVarDisplay.split(' ').join(CenvLog.colors.info(`\n`) + `export `).replace('\n', '') : '');
        }
        if (configVarDisplay && configVarDisplay.trim().length > 0) {
          log(options, cmdLog, packageInfo, '# cenv config vars');
          log(options, cmdLog, packageInfo, configVarDisplay ? configVarDisplay.split(' ').join(CenvLog.colors.info(`\n`) + `export `).replace('\n', '') : '');
        }
        log(options, cmdLog, packageInfo, `${CenvLog.colors.info(`${cons} `)}${CenvLog.colors.infoBold(cmd)}`)
      }

      const spawnArgs = cmd.split(' ');
      const cmdFinal = spawnArgs.shift();

      let stdio: child.StdioOptions = 'inherit';

      let pipedOutput = false;
      if (packageInfo || options?.returnOutput || options?.pipedOutput || options?.redirectStdErrToStdOut) {
        const stdin = options?.stdin ? 'overlapped' : 'ignore';
        stdio = [stdin, 'overlapped', 'overlapped'];
        pipedOutput = true;
      } else if (options?.stdin) {
        stdio = ['overlapped', 'inherit', 'inherit'];
      }

      const opt: any = {
        detached: options?.detached, stdio: stdio, env: options.envVars,
      };
      opt.env.CENV_SPAWNED = 'true';
      const output: any = '';
      if (packageInfo && process.env.CENV_VERBOSE_SPAWN_OPTIONS) {
        packageInfo.info(packageInfo.packageName, JSON.stringify(opt, null, 2));
      }
      const proc = child.spawn(cmdFinal as string, spawnArgs, opt);
      const processName = `${packageInfo ? `[${packageInfo.stackName}] ` : ''}${cmd}`;
      Cenv.addSpawnedProcess(packageInfo ? packageInfo.stackName : 'GLOBAL', processName, proc);

      if (stdio?.length && stdio[0] === 'overlapped') {
        proc.stdin.pipe(options.stdin);
      }
      if (pipedOutput) {
        proc.stdout.setEncoding('utf-8');
        proc.stderr.setEncoding('utf-8');
        proc.stdout.on('data', function (chunk) {
          spawnInfo(options, chunk, output);
        });
        proc.stderr.on('data', function (chunk) {
          spawnErr(chunk, options, errors, output, cmdLog, packageInfo );
        });
      }
      // proc.on('close', function (code) { });
      proc.on('error', function (error: any) {
        spawnErr(error, options, errors, output, cmdLog, packageInfo );
      });

      proc.on('exit', async function (code) {
        if (proc.pid && Cenv.processes) {
          delete Cenv.processes[proc.pid];
        }

        if (code === undefined || code === null) {
          code = 1;
        }

        if (options.commandEvents?.postCommandFunc) {
          await options.commandEvents.postCommandFunc(cmdLog);
        }

        if (options.returnOutput) {
          const returnOutput = {stdout: output, result: code};
          if (cmdLog) {
            if (!cmdLog.result(code)) {
              reject(returnOutput)
            } else {
              resolve(returnOutput);
            }
          } else {
            if (code !== 0 || errors.length) {
              if (errors.length) {
                handleErrors(errors, packageInfo);
              }
              reject(returnOutput);
            } else {
              resolve(returnOutput);
            }
          }
        } else if (cmdLog) {
          if (!cmdLog.result(code)) {
            reject(code)
          } else {
            resolve(code);
          }
        } else if (code !== 0 || errors.length) {
          if (errors.length) {
            handleErrors(errors, packageInfo);
          }
          reject(code);
        } else {
          resolve(code);
        }
      });

      if (options?.detached) {
        if (!options?.waitForOutput) {
          resolve(0);
        }
        if (options?.waitSeconds && options.waitSeconds > 0) {
          resolve(0);
        }
      }
    });
  } catch (e) {
    if (packageInfo) {
      packageInfo.err('spawnCmd() catch:' + e);
    }
    return 1;
  }
}


export async function execExists(exec: string) {
  const execPath = await execCmd('which ' + exec);
  if (!execPath) {
    return false;
  }
  return execPath?.length > 0;
}

async function execInit(application: string, environment: string) {
  //await Cenv.initVars({defaults: true, environment, application, push: true, force: true});
}

// old execCmd
// export function execCmd(folder: string, cmd: string, name?: string, envVars: object = {}, rejectOnStdErr = false, silent = false, pkg?: Package): Promise<string> {
export async function execCmd(cmd: string, options: {
  envVars?: any;
  path?: string;
  cenvVars?: any;
  pkgCmd?: PackageCmd;
  failOnError?: boolean;
  packageModule?: PackageModule;
  silent?: boolean;
} = {
  envVars: {}, cenvVars: {}, silent: false,
}): Promise<string> {
  try {
    const silent = options?.silent === true;
    const module = options?.packageModule;
    const pkg = module ? module.pkg : Package.global;
    let pkgPath = module ? module.path : options?.path
    if (!pkgPath) {
      pkgPath = process.cwd();
    }
    if (!options.failOnError) {
      options.failOnError = false;
    }

    let envVarDisplay: string | null = null;
    let envVarFinal: string | null = null;
    if (options?.envVars && Object.values(options.envVars).length) {
      envVarFinal = inputArgsToEnvVars(options.envVars);
      envVarDisplay = envVarFinal;
      envVarDisplay = envVarDisplay.replace(/AWS_ACCESS_KEY_ID=(\S*)/, 'AWS_ACCESS_KEY_ID=[***]',);
      envVarDisplay = envVarDisplay.replace(/AWS_SECRET_ACCESS_KEY=(\S*)/, 'AWS_SECRET_ACCESS_KEY=[***]',);
      envVarDisplay = ' ' + envVarDisplay;
      envVarFinal += ' ';
    }

    const relativeDir = path.relative(process.cwd(), path.resolve(pkgPath!));
    const newCwd: string = './' + relativeDir;

    const originalDir = process.cwd();
    const consoleFolder = path.resolve(newCwd).split('/').pop();
    const cons = `${process.env.USER}@${hostname()} ${consoleFolder} %`;
    try {
      if (pkg.name && !silent) {
        //log(`${cons} cd ${infoBold(folder)}`);
        CenvLog.single.stdLog(envVarDisplay ? envVarDisplay.split(' ').join(CenvLog.colors.info(`\n`) + `export `).replace('\n', '') : '', pkg.stackName);
        CenvLog.single.infoLog(`${CenvLog.colors.info(cons)} ${cmd}`, pkg?.stackName);
      }
    } catch (e) {
      if (e) {
        CenvLog.single.errorLog(e.toString(), pkg?.stackName, true);
      }
    }
    //console.log(`changing working directory from: ${originalDir} to ${newCwd}`)
    if (relativeDir !== '') {
      process.chdir(newCwd);
    }

    cmd = `${envVarFinal ? envVarFinal : ''}${cmd}`;
    const outputBuffer = child.execSync(cmd + ' 2>&1', {'encoding': 'utf-8'});
    const output = outputBuffer.toString().replace(/\n$/, '');
    if (!silent) {
      CenvLog.single.infoLog(output);
    }
    return output;
  } catch (e) {
    if (options && options.silent !== true) {
      CenvLog.single.errorLog('cenv execCmd error: \n' + (e instanceof Error ? e.stack : e));
    }
    if (e instanceof Object || e instanceof Error) {
      return JSON.stringify({ error: JSON.stringify(e, null, 2) }, null, 2);
    }
    return e as string;
  }
}

export async function processEnvFile(envFile: string, envName: string) {
  const result = envFile.match(/^(.*)\/(\.cenv\.?([a-zA-Z0-9-\._]*)\.?(globals)?)$/);
  if (result?.length === 5) {
    const [, servicePath, , configEnvironment] = result;
    if (configEnvironment === envName || configEnvironment === "" || configEnvironment === 'globals') {
      CenvLog.info(CenvLog.colors.infoBold(servicePath), 'service path');
      return {valid: true, servicePath, environment: envName};
    }
  }
  return {valid: false}
}

export async function processEnvFiles(environment: string, added?: string[], changed?: string[], deleted?: string[]) {
  if (changed) {
    await execEnvironment(environment, changed, execInit);
  }
  if (deleted) {
    const execDestroy = async (application: string) => { await deleteCenvData(application, false, true) }
    await execEnvironment(environment, deleted, execDestroy);
  }
}

async function execEnvironment(environment: string, fileList: string[] = [], func: (application: string, environment: string) => Promise<void>) {
  let processList: any = [];
  if (fileList?.length > 0) {
    processList = await Promise.all(fileList.map(async (envFile) => {
      return await processEnvFile(envFile, environment);
    }));
  }
  const servicePaths = new Set<string>();
  processList.map((envFile: any) => {
    if (envFile.valid) {
      servicePaths.add(envFile.servicePath)
    }
  });
  const paths: string[] = Array.from(servicePaths);
  const lernaPath = await execCmd(`git rev-parse --show-toplevel`) as string;

  for (let i = 0; i < paths.length; i++) {
    const servicePath = paths[i].toString();
    console.log('change to service dir', path.join('./', servicePath))
    process.chdir(path.join('./', servicePath));

    // at this point we have to figure out which application we are updating
    // we know the environment because of the branch but we don't know the application
    // and there is no settings file to tell us
    // so we have to look at the package.json and see if there is a cdk application
    if (existsSync('package.json')) {
      const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
      if (!pkg?.cenv?.ApplicationName) {
        pkg.cenv = {ApplicationName: pkg.name, GlobalPath: CenvFiles.GLOBAL_PATH}
      }
      await func(pkg.cenv.ApplicationName, environment);
    } else {
      CenvLog.single.errorLog(`No package.json for ${path}`);
    }

    console.log('change to lerna',)
    process.chdir(lernaPath)
  }
}
/*
export function execCmd(folder: string, cmd: string, name?: string, envVars: object = {}, rejectOnStdErr = false, silent = false, pkg?: Package): Promise<string> {

  function log(...text: string[]) {

    //if (!silent && packageInfo) {
    //  packageInfo.info(...text);
    //} else if (!silent) {
    CenvLog.single.stdLog(text, pkg?.stackName);
    //}
  }

  function err(...text: string[]) {
    //if (!silent && packageInfo) {
    //  packageInfo.err(...text);
    //} else if (!silent) {
    CenvLog.single.errorLog(text, pkg?.stackName, true);
    //}
  }

  let envVarDisplay: string, envVarFinal: string;
  if (Object.values(envVars).length) {
    envVarFinal = inputArgsToEnvVars(envVars);
    envVarDisplay = envVarFinal;
    envVarDisplay = envVarDisplay.replace(/AWS_ACCESS_KEY_ID=(\S*)/, 'AWS_ACCESS_KEY_ID=[***]',);
    envVarDisplay = envVarDisplay.replace(/AWS_SECRET_ACCESS_KEY=(\S*)/, 'AWS_SECRET_ACCESS_KEY=[***]',);
    envVarDisplay = ' ' + envVarDisplay;
    envVarFinal += ' ';
  }

  return new Promise((resolve, reject) => {

    const relativeDir = path.relative(process.cwd(), path.resolve(folder));
    const newCwd: string = './' + relativeDir;

    const originalDir = process.cwd();
    const consoleFolder = path.resolve(newCwd).split('/').pop();
    const cons = `${process.env.USER}@${hostname()} ${consoleFolder} %`;
    try {
      if (name && !silent) {
        //log(`${cons} cd ${infoBold(folder)}`);
        log(envVarDisplay ? envVarDisplay.split(' ').join(CenvLog.colors.info(`\n`) + `export `).replace('\n', '') : '')
        CenvLog.single.infoLog(`${CenvLog.colors.info(cons)} ${cmd}`, pkg?.stackName);
      }
    } catch (e) {
      if (e) {
        err(e.toString());
      }
    }
    //console.log(`changing working directory from: ${originalDir} to ${newCwd}`)
    if (relativeDir !== '') {
      process.chdir(newCwd);
    }

    cmd = `${envVarFinal ? envVarFinal : ''}${cmd}`;

    if (name) {
      name += ' ';
    } else {
      name = 'execCmd ';
    }

    child.exec(cmd, (error, stdout, stderr) => {
      if (error) {
        if (!silent) {
          err(`${error}`);
        }
        //reject(error);
      }
      if (stderr && rejectOnStdErr) {
        if (!silent) {
          err(`${stderr}`);
        }
        reject(stderr);
      }
      if (stdout) {
        if (!silent) {
          //log(`${stdout}`);
        }
      }
      if (originalDir != process.cwd()) {
        process.chdir(originalDir);
      }

      resolve(stdout);
    });
  });
}
*/

export async function execAll(shell: string, configure = false, sequential = false,) {
  if (configure && process.env.CENV_CONFIGURE) {
    shell = `${process.env.CENV_CONFIGURE} ${shell}`;
  }
  let concurrency = '';
  if (sequential) {
    concurrency = '--concurrency 1 ';
  }
  return await execCmd(`/Users/stoked/.npm-packages/bin/lerna exec ${concurrency} -- ${shell}`);
}
