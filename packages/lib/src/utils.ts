import * as path from 'path';
import {join} from 'path';
import child_process, {exec} from 'child_process';
import {ClientMode, startCenv} from './aws/appConfigData';
import {CenvLog, info, infoAlert, infoBold, LogLevel} from './log';
import fs, {existsSync, readFileSync, rmSync} from 'fs';
import * as os from 'os';
import {hostname} from 'os';
import {CenvParams, DashboardCreateOptions} from './params';
import {Package, PackageCmd, ProcessStatus} from './package/package';
import chalk from 'chalk';
import * as fsp from 'fs/promises';
import {createHash} from 'crypto';
import {ProcessMode} from "./package/module";
import {CenvFiles} from "./file";
import {deleteCenvData} from "./aws/appConfig";
import {Suite} from "./suite";
import {Environment} from "./environment";
import {Cenv, StackProc} from "./cenv"
import {cancelUpdateStack} from "./aws/cloudformation";

function stringOrStringArrayValid(value: string | string[]): boolean {
  return isString(value) ? !!value : value && value.length > 0;
}

export function inputArgsToEnvVars(inputArgs: any) {
  let args = '';
  if (inputArgs) {
    for (const [key, value] of Object.entries(inputArgs)) {
      if (value) args += `${key}=${value} `;
    }
  }
  return args.trim();
}

export function isString(value: any) {
  return typeof value === 'string' || value instanceof String;
}

export function stringToArray(value: string | string[]): string[] {
  return isString(value) ? [value as string] : (value as string[]);
}

const packagePaths: any = {};
export function packagePath(packageName: string): string {
  if (packageName === 'GLOBAL') {
    return getMonoRoot();
  }
  if (packagePaths[packageName])
    return packagePaths[packageName];

  const monoRoot = getMonoRoot();
  const packages = search_sync(monoRoot, false, true, 'package.json', {
    excludedDirs: ['cdk.out', 'node_modules'],
  });

  for (let i = 0; i < packages.length; i++) {
    let packagePath: any = packages[i].split('/');
    packagePath.pop();
    packagePath = packagePath.join('/');
    const name = require(packages[i]).name;
    if (!packagePaths[name]) {
      packagePaths[name] = packagePath;
    }
  }

  if (packagePaths[packageName]) return packagePaths[packageName];
  return undefined;
}

export async function execAll(
  shell: string,
  configure = false,
  sequential = false,
) {
  if (configure && process.env.CENV_CONFIGURE) {
    shell = `${process.env.CENV_CONFIGURE} ${shell}`;
  }
  let concurrency = '';
  if (sequential) {
    concurrency = '--concurrency 1 ';
  }
  const execRes = await execCmd(
    './',
    `/Users/stoked/.npm-packages/bin/lerna exec ${concurrency} -- ${shell}`,
  );
  return execRes;
}

export async function isLocalStackRunning() {
  try {
    let status: any = await execCmd(
      './',
      'localstack status docker --format json',
      'localstack status',
    );
    status = JSON.parse(status);
    return status.running;
  } catch (e) {
    return false;
  }
}

export function enumKeys<O extends object, K extends keyof O = keyof O>(obj: O): K[] {
  return Object.keys(obj).filter(k => Number.isNaN(+k)) as K[];
}

function printIfExists(color = true, envVar: string) {
  if (process.env[envVar]) {
    let isClear = true;
    if (
      ['pass', 'key', 'secret'].some((v) => envVar.toLowerCase().includes(v))
    ) {
      isClear = false;
    }

    if (color) {
      CenvLog.single.infoLog(
        `export ${envVar}=${infoBold(isClear ? process.env[envVar] : '****')}`,
      );
    } else {
      console.log(
        `export ${envVar}=${infoBold(isClear ? process.env[envVar] : '****')}`,
      );
    }
  }
}

export function printConfigurationExports(color = true) {
  printIfExists(color, 'AWS_PROFILE');
  printIfExists(color, 'AWS_REGION');
  printIfExists(color, 'ENV');
  printIfExists(color, 'ROOT_DOMAIN');
  printIfExists(color, 'AWS_ACCESS_KEY_ID');
  printIfExists(color, 'AWS_SECRET_ACCESS_KEY');
  printIfExists(color, 'AWS_ENDPOINT');
  printIfExists(color, 'LOCALSTACK_API_KEY');
  printIfExists(color, 'CDK_DEFAULT_ACCOUNT');
  printIfExists(color, 'CDK_DEFAULT_REGION');
}

export function printApp(cmd: string, envVars: Record<string, string>, cenvVars: Record<string, string>) {
  let envVarDisplay;
  if (envVars && Object.keys(envVars).length) {
    envVarDisplay = inputArgsToEnvVars(envVars);
    envVarDisplay = envVarDisplay.replace(
      /AWS_ACCESS_KEY_ID=(\S*)/,
      'AWS_ACCESS_KEY_ID=[***]',
    );
    envVarDisplay = envVarDisplay.replace(
      /AWS_SECRET_ACCESS_KEY=(\S*)/,
      'AWS_SECRET_ACCESS_KEY=[***]',
    );
    envVarDisplay = ' ' + envVarDisplay;
  } else {
    printConfigurationExports();
  }

  const consoleFolder = process.cwd().split('/').pop();
  const cons = `${hostname()}:${consoleFolder} ${process.env.USER}$`;
  if (envVarDisplay && envVarDisplay.trim().length > 0) {
    CenvLog.single.infoLog(
      envVarDisplay
        ? envVarDisplay
            .split(' ')
            .join(info(`\n`) + `export `)
            .replace('\n', '')
        : '',
    );
  }

  if (Object.keys(cenvVars).length) {
    let configVarDisplay = inputArgsToEnvVars(cenvVars);
    configVarDisplay = ' ' + configVarDisplay;
    CenvLog.single.infoLog('# cenv config vars');
    CenvLog.single.infoLog(
      configVarDisplay
        ? configVarDisplay
            .split(' ')
            .join(info(`\n`) + `export `)
            .replace('\n', '')
        : '',
    );
  }

  console.log(`${info(`${cons} `)}${infoBold(cmd)}`);
}

export interface ICmdOptions {
  envVars?: any;
  cenvVars?: any;
  detached?: boolean;
  waitSeconds?: number;
  waitForOutput?: string;
  stdio?: child_process.StdioOptions;
  getCenvVars?: boolean;
  output?: boolean;
  stdin?: any;
  failOnError?: boolean;
  returnOutput?: boolean;
  redirectStdErrToStdOut?: boolean;
  pipedOutput?: boolean;
  pkgCmd?: PackageCmd;
  silent?: boolean;
}

function spawnInfo(options: any, chunk: string, output: string, pkg: Package) {
  if (options.returnOutput) {
      output += chunk;
  } else if (Object.keys(LogLevel).indexOf(CenvLog.logLevel) < Object.keys(LogLevel).indexOf(LogLevel.INFO)) {
    CenvLog.single.tempLog('t: ' + chunk, pkg?.stackName);
  } else {
    CenvLog.single.infoLog('s: ' + chunk, pkg?.stackName);
  }
}

export async function spawnCmd(
  folder: string,
  cmd: string,
  name: string = undefined,
  options: ICmdOptions = {
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
    pipedOutput: false
  },
  packageInfo: Package = undefined,
): Promise<any> {
  let cmdLog: PackageCmd = options.pkgCmd;
  if (packageInfo && !cmdLog && !options.silent) {
    cmdLog = packageInfo.createCmd(cmd);
  }
  if (cmd === 'cenv destroy --parameters --config') {
    packageInfo.alert('cmdLog', cmdLog.cmd)
  }

  function log(...text: string[]) {
    if (options.silent) {
      return;
    }
    if (cmdLog) {
      cmdLog.info(...text);
    } else if (packageInfo) {
      packageInfo.info(...text);
    } else if (!options.silent) {
      CenvLog.single.infoLog(text)
    }
  }

  let hasErrors = false;
  let errors: any = [];
  try {

    function err(...text: string[]) {
      hasErrors = true;
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
    }

    function spawnErr(options: any, chunk: string, output: string, pkg: Package) {
      if (options?.redirectStdErrToStdOut) {
        const actualErrors = new RegExp(/ERROR/, 'i').exec(chunk);
        if (!actualErrors) {
          spawnInfo(options, chunk, output, pkg);
        } else {
          err(chunk, pkg ? pkg.stackName : undefined)
        }
      } else {
        err(chunk, pkg ? pkg.stackName : undefined)
      }
    }

    const relativeDir = path.relative(process.cwd(), path.resolve(folder));
    const newCwd: string = './' + relativeDir;
    return new Promise(async (resolve, reject) => {

      function handleErrors() {
        if (hasErrors) {
          errors.forEach((err: string) => {
            packageInfo.err(err)
          })
        }
      }

      if (relativeDir !== '') {
        process.chdir(newCwd);
      }
      let configVars = null;
      let configVarDisplay = null;
      if (options.getCenvVars && !packageInfo) {
        const useCurrentDirectory = existsSync('.cenv');
        const useParentDirectory = useCurrentDirectory ? false : existsSync('../.cenv');
        const skipCenv = !useCurrentDirectory && !useParentDirectory;
        if (useParentDirectory) {
          process.chdir('../');
        }
        if (!skipCenv) {
          configVars = await startCenv(ClientMode.REMOTE_ON_STARTUP, '0 * * * *', true);
          if (Object.keys(configVars).length) {
            configVarDisplay = inputArgsToEnvVars(configVars);
            configVarDisplay = ' ' + configVarDisplay;
          }
        }
        if (useParentDirectory) {
          process.chdir('./deploy');
        }
      }
      let envVarDisplay;
      if (!packageInfo) {
        if (options?.envVars && Object.keys(options?.envVars).length) {
          envVarDisplay = inputArgsToEnvVars(options?.envVars);
          envVarDisplay = envVarDisplay.replace(
            /AWS_ACCESS_KEY_ID=(\S*)/,
            'AWS_ACCESS_KEY_ID=[***]',
          );
          envVarDisplay = envVarDisplay.replace(
            /AWS_SECRET_ACCESS_KEY=(\S*)/,
            'AWS_SECRET_ACCESS_KEY=[***]',
          );
          envVarDisplay = ' ' + envVarDisplay;
        } else {
          printConfigurationExports();
        }
      }
      options.envVars = {
        ...options.envVars,
        ...configVars,
        ...process.env,
        ...options.cenvVars,
        FORCE_COLOR: 1,
      };

      process.env.FORCE_COLOR = '1';
      const consoleFolder = process.cwd().split('/').pop();
      const cons = `${hostname()}:${consoleFolder} ${process.env.USER}$`;
      if (!packageInfo) {
        if (envVarDisplay && envVarDisplay.trim().length > 0) {
          log(envVarDisplay ? envVarDisplay.split(' ').join(info(`\n`) + `export `).replace('\n', '') : '');
        }
        if (configVarDisplay && configVarDisplay.trim().length > 0) {
          log('# cenv config vars');
          log(configVarDisplay ? configVarDisplay.split(' ').join(info(`\n`) + `export `).replace('\n', '') : '');
        }
        log(`${info(`${cons} `)}${infoBold(cmd)}`)
      }

      const spawnArgs = cmd.split(' ');
      const cmdFinal = spawnArgs.shift();

      let stdio: child_process.StdioOptions = 'inherit';

      let pipedOutput = false;
      if (
        packageInfo ||
        options?.returnOutput ||
        options?.pipedOutput ||
        options?.redirectStdErrToStdOut
      ) {
        const stdin = options?.stdin ? 'overlapped' : 'ignore';
        stdio = [stdin, 'overlapped', 'overlapped'];
        pipedOutput = true;
      } else if (options?.stdin) {
        stdio = ['overlapped', 'inherit', 'inherit'];
      }

      const opt: any = {
        detached: options?.detached,
        stdio: stdio,
        env: options.envVars,
      };
      opt.env.CENV_SPAWNED = 'true';
      const output: any = '';
      if (packageInfo && process.env.CENV_VERBOSE_SPAWN_OPTIONS) {
        packageInfo.info(packageInfo.packageName, JSON.stringify(opt, null, 2));
      }
      const proc = child_process.spawn(cmdFinal, spawnArgs, opt);
      const processName = `${packageInfo ? `[${packageInfo.stackName}] ` : ''}${cmd}`;
      Cenv.addSpawnedProcess(packageInfo.stackName, processName, proc);

      if (stdio?.length && stdio[0] === 'overlapped') {
        proc.stdin.pipe(options.stdin);
      }
      if (pipedOutput) {
        proc.stdout.setEncoding('utf-8');
        proc.stderr.setEncoding('utf-8');
        proc.stdout.on('data', function (chunk) {
          spawnInfo(options, chunk, output, packageInfo);
        });
        proc.stderr.on('data', function (chunk) {
          spawnErr(options, chunk, output, packageInfo);
        });
      }
      // proc.on('close', function (code) { });
      proc.on('error', function (error: any) {
        spawnErr(options, error, output, packageInfo);
      });

      proc.on('exit', async function (code) {
        if (code === undefined || code === null) {
          code = 1;
        }

        if (options.returnOutput) {
          const returnOutput = { stdout: output, result: code };
          if (cmdLog) {
            !cmdLog.result(code, output) ? reject(returnOutput) : resolve(returnOutput);
          } else {
            if (code !== 0 || hasErrors) {
              if (hasErrors) {
                handleErrors();
              }
              reject(returnOutput);
            } else {
              resolve(returnOutput);
            }
          }
        } else if (cmdLog) {
          !cmdLog.result(code) ? reject(code) : resolve(code);
        } else if (code !== 0 || hasErrors) {
          if (hasErrors) {
            handleErrors();
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
        if (options?.waitSeconds > 0) {
          resolve(0);
        }
      }
    });
  } catch (e) {
    if (packageInfo) {
      packageInfo.err(e)
    }
    return 1;
  }
}

export function execCmd(
  folder: string,
  cmd: string,
  name: string = undefined,
  envVars: object = {},
  rejectOnStdErr = false,
  silent = false,
  packageInfo: Package = undefined,
): Promise<string> {

  function log(...text: string[]) {
    if (packageInfo) {
      packageInfo.info(...text);
    } else  {
      CenvLog.single.infoLog(text)
    }
  }

  function err(...text: string[]) {
    if (packageInfo) {
      packageInfo.err(...text);
    } else  {
      CenvLog.single.errorLog(text)
    }
  }

  let envVarDisplay: string, envVarFinal: string;
  if (Object.values(envVars).length) {
    envVarFinal = inputArgsToEnvVars(envVars);
    envVarDisplay = envVarFinal;
    envVarDisplay = envVarDisplay.replace(
      /AWS_ACCESS_KEY_ID=(\S*)/,
      'AWS_ACCESS_KEY_ID=[***]',
    );
    envVarDisplay = envVarDisplay.replace(
      /AWS_SECRET_ACCESS_KEY=(\S*)/,
      'AWS_SECRET_ACCESS_KEY=[***]',
    );
    envVarDisplay = ' ' + envVarDisplay;
    envVarFinal += ' ';
  }
  return new Promise((resolve, reject) => {

    const relativeDir = path.relative(process.cwd(), path.resolve(folder));
    const newCwd: string = './' + relativeDir;

    const originalDir = process.cwd();
    const consoleFolder = folder.split('/').pop();
    const cons = `${hostname()}:${consoleFolder} ${process.env.USER}$`;
    try {
      if (name && !silent) {
        log(`${cons} cd ${infoBold(folder)}`);
        log(envVarDisplay ? envVarDisplay.split(' ').join(info(`\n`) + `export `).replace('\n', '') : '')
        log(`${cons} ${infoBold(cmd)}`)
      }
    } catch(e) {
      err(e);
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
    exec(cmd, (error, stdout, stderr) => {
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
          log(`${stdout}`);
        }
      }
      if (originalDir != process.cwd()) {
        process.chdir(originalDir);
      }
      resolve(stdout);
    });
  });
}

export function fromDir(startPath: string, filter: string | RegExp, foundMsg = '-- found: ', recursive = false) {
  if (!fs.existsSync(startPath)) {
    console.log('no dir ', startPath);
    return;
  }

  const files = fs.readdirSync(startPath);
  const foundFiles = [];
  for (let i = 0; i < files.length; i++) {
    const filename = path.join(startPath, files[i]);
    const stat = fs.lstatSync(filename);
    if (stat.isDirectory() && recursive) {
      fromDir(filename, filter); //recurse
    } else if (filename.match(filter)) {
      if (foundMsg) {
        console.log(foundMsg, filename);
      }
      foundFiles.push(filename);
    }
  }
  return foundFiles;
}

export function unimplemented() {
  console.log(infoAlert('Unimplemented!'));
}

export function search_sync(
  dir: string,
  first = false,
  searchDown = true,
  searchFile: string | RegExp = 'package.json',
  options: {
    startsWith?: boolean;
    endsWith?: boolean;
    excludedDirs?: string[];
    includedDirs?: string[];
    regex?: boolean;
  } = {
    startsWith: false,
    endsWith: false,
    excludedDirs: [],
    includedDirs: [],
    regex: false,
  },
): string[] | string {
  let results = [];
  const list = fs.readdirSync(dir);
  const directories = [];
  for (let i = 0; i < list.length; i++) {
    const fileName = list[i];
    const file = path.resolve(dir, fileName);
    const filenameList = file.split('\\');
    const filename = filenameList[filenameList.length - 1];
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory() && searchDown) {
      let addDir = true;
      if (options?.excludedDirs?.length) {
        const excludedMatches = options?.excludedDirs.filter((ed) =>
          file.endsWith('/' + ed),
        );
        addDir = !excludedMatches.length;
      }
      if (addDir) {
        directories.push(file);
      }
    } else {
      if (options?.includedDirs?.length) {
        const includedMatches = options?.includedDirs?.filter((id) =>
          dir.endsWith('/' + id),
        );
        if (!includedMatches.length) {
          continue;
        }
      }
      let foundFile = undefined;
      if (searchFile instanceof RegExp) {
        const m = fileName.match(searchFile)?.length;
        if (m) {
          foundFile = file;
        }
      } else if (!options?.regex && fileName === searchFile) {
        foundFile = file;
      } else if (options?.startsWith && fileName.startsWith(searchFile)) {
        foundFile = file;
      } else if (options?.endsWith && fileName.endsWith(searchFile)) {
        foundFile = file;
      } else if (options?.regex) {
        const m = fileName.match(searchFile)?.length;
        if (m) {
          foundFile = file;
        }
      }
      if (foundFile) {
        if (first) {
          return [filename];
        }
        results.push(foundFile);
      }
    }
  }
  if (searchDown) {
    for (let i = 0; i < directories.length; i++) {
      const dirPath = directories[i];
      results = results.concat(
        search_sync(dirPath, first, searchDown, searchFile, options),
      );
    }
  } else {
    results = results.concat(
      search_sync(join(dir, '../'), first, searchDown, searchFile, options),
    );
  }
  return results;
}

export function exitWithoutTags(tags: any) {
  if (tags.length > 0) {
    const pkgPath = search_sync('./', true);
    const pkg = require(pkgPath[0].toString());
    let packHasMatchingTag = false;
    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i];
      if (pkg?.nx?.tags?.indexOf(tag) > -1) {
        packHasMatchingTag = true;
      }
    }
    if (!packHasMatchingTag) {
      process.exit(0);
    }
  }
}

export function getMonoRoot() {
  if (packagePaths['root']) {
    return packagePaths['root'];
  }
  const searchResults = search_sync('./', true, false, 'lerna.json');
  const root = searchResults[0].split('/');
  root.pop();
  const rootPath = path.resolve(root.join('/'));
  packagePaths['root'] = rootPath;
  return rootPath;
}

function elapsedBase(start: [number, number], format = 'seconds', note: string, silent = false) {
  let e: any = process.hrtime(start);
  e = e[0] * 1000 + e[1] / 1000000;
  switch (format) {
    case 'milliseconds': {
      break;
    }
    case 'minutes': {
      e = e / 1000 / 60;
      break;
    }
    case 'hours': {
      e = e / 1000 / 60 / 60;
      break;
    }
    case 'seconds':
    default: {
      e = e / 1000;
      break;
    }
  }

  e = e.toFixed(2);

  if (note && !silent) {
    CenvLog.single.alertLog(`${note} timer: ${e} ${format}`); // print message + time
  }
  return e;
}

export class Timer {
  startTime: [number, number];
  final: [number, number];
  finalElapsed: string;
  note: string;
  format: string;
  silent: boolean;
  running = false;

  get elapsed() {
    if (this.running) {
      return elapsedBase(this.startTime, this.format, this.note, this.silent) + this.format[0];
    } else if (this.finalElapsed) {
      return `${this.finalElapsed}${this.format[0]}`;
    } else {
      return 'N/A'
    }
  }

  constructor(note: string, format: string, start = false, silent = true) {
    this.format = format;
    this.note = note;
    this.silent = silent;
    if (start) {
      this.start();
    }
  }

  state() {
    const res: any = {
      elapsed: undefined,
      format: this.format,
      note: this.note,
      final: this.final,
    };

    res.elapsed = this.elapsed;

    return res;
  }

  stop() {
    this.finalElapsed = elapsedBase(this.startTime, this.format, this.note, this.silent);
    this.final = process.hrtime();
    this.running = false;
  }

  start() {
    this.clear();
    this.startTime = process.hrtime();
    this.running = true;
  }

  clear() {
    delete this.startTime;
    delete this.finalElapsed;
    delete this.final;
    this.running = false;
  }
}
/*
export class TimerModules {
  private static timerList = [];
  private static timerMap = {};
  public static title = null;
  private static timer = null;

  public static push(obj) {
    if (this.timerList.length === 0) {
      this.timer = new Timer('total', 'seconds', true);
    }
    this.timerList.push(obj);
    if (obj.note) {
      this.timerMap[obj.note] = obj;
    }
  }

  public static show() {
    if (this.title && this.timerList.length > 0) {
      CenvLog.single.alertLog(chalk.bold.underline(this.title));
      this.timerList.push(this.timer.elapsed());
    }

    this.timerList.forEach((t) => {
      CenvLog.single.alertLog(`\t${t.note}: ${t.elapsed} ${t.format}`);
    });
  }
}*/

export const sleep = (seconds: number) =>
  new Promise((r) => setTimeout(r, seconds * 1000));

export function simplify(yamlData: any, printPkg?: string) {
  const result: any = {};
  if (yamlData) {
    for (const [key, value] of Object.entries(yamlData)) {
      const val: any = value;
      if (val) {
        const keyVal = val.Value ? val.Value : val;
        result[key] = keyVal;
      }
    }
  }
  return result;
}

export function expandTemplateVars(baseVars: any) {
  // clear the protection
  Object.keys(baseVars).map((k) => {
    baseVars[k] = baseVars[k].replace(/^<\](.*?)\[>$/, '$1');
  });
  let m;
  const regex = /<{(.*?)}>/gm;

  const dependencyTree: { [key: string]: Set<string> } = {};
  const keys = Object.keys(baseVars);
  keys.map((k) => {
    const value = baseVars[k];
    while ((m = regex.exec(value)) !== null) {
      // handle infinite loops with zero-width matches
      if (m.index === regex.lastIndex) {
        regex.lastIndex++;
      }
      m.forEach((match, groupIndex) => {
        if (!dependencyTree[k]) {
          dependencyTree[k] = new Set();
        }
        if (groupIndex === 0) {
        } else {
          dependencyTree[k].add(match);
        }
      });
    }
  });
  function processTree(tree: any) {
    const dependencies = new Set<string>();
    Object.keys(tree).map((key) => {
      for (const dep of tree[key].keys()) {
        dependencies.add(dep);
      }
    });
    return dependencies;
  }
  const dependencies = processTree(dependencyTree);
  const size = dependencies.size;
  let iteration = 0;
  let lastSize = size;
  while (dependencies.size) {
    for (const dep of dependencies.keys()) {
      if (!dependencyTree[dep]) {
        Object.keys(baseVars).map((k) => {
          baseVars[k] = baseVars[k].replace(`<{${dep}}>`, baseVars[dep]);
        });
        Object.keys(dependencyTree).map((key) => {
          dependencyTree[key].delete(dep);
          if (dependencyTree[key].size === 0) {
            delete dependencyTree[key];
          }
        });
        dependencies.delete(dep);
      }
    }
    iteration++;

    if (lastSize === dependencies.size) {
      break;
    }
    lastSize = dependencies.size;
    processTree(dependencyTree);
  }
  return baseVars;
}

export async function deleteFiles(search: string | RegExp, options: any) {
  console.log(search, options);
  const monoRoot = getMonoRoot();
  const results = search_sync(
    path.resolve(monoRoot),
    false,
    true,
    search,
    options,
  );
  for (let i = 0; i < results.length; i++) {
    const file = results[i];

    rmSync(file);
  }
}

export function randomRange(min: number, max: number) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min) + min);
}

export function printFlag(options: Record<string, any>, flag: string) {
  return options[flag] ? ` --${flag}` : ''
}

export async function showPkgCmdsResult(cmds: PackageCmd[]) {
  const failures = cmds.filter((c) => c?.code !== 0);
  const success = cmds.filter((c) => c?.code === 0);
  success.map((f) => {
    f ? CenvLog.single.infoLog(`${f?.cmd} exit(${f?.code})\n`, f?.stackName) : ''
  });
  if (failures?.length) {
    failures.map((f) =>
      f ? CenvLog.single.errorLog(`${f?.cmd} ${f?.code}\n`, f?.stackName) : ''
    );
    process.exit(9);
  }
}

export function clamp(number: number, min: number, max: number) {
  return Math.min(Math.max(number, min), max);
}

export async function killStackProcesses(stackName: string, stackProcs: StackProc[]) {
  for(const stackProc of stackProcs) {

    CenvLog.err(info(`kill child process: ${infoBold(stackProc.cmd)}`));
    stackProc.proc.kill();
    if (stackProc.cmd.startsWith('cdk')) {
      await cancelUpdateStack(stackName);
    }
  }
}

export async function killRunningProcesses() {
  for (const [stackName, stackProcs ] of Object.entries(Cenv.runningProcesses) as [string, StackProc[]][] ) {
    await killStackProcesses(stackName, stackProcs);
  }
}

export function destroyUI() {
  if (Cenv.dashboard) {
    if (Cenv.dashboard.screen) {
      Cenv.dashboard.screen?.destroy();
      console.log('Cenv.dashboard.screen?.destroy(kk)');
    }
    delete Cenv.dashboard;
    console.log('delete Cenv.dashboard');
  }
}

export function cleanup(eventType: string) {
  destroyUI();
  console.log('cleanup', new Error().stack);

  if (process.env.CENV_LOG_LEVEL === 'VERBOSE') {
    process.argv.shift();
    process.argv[0] = process.argv[0].split('/').pop();
    console.log(`[${eventType}] ${process.argv.join(' ')}`);
  }

  killRunningProcesses();
}

// -----------------------------------------------------
// Returns a buffer with a computed hash of all file's metadata:
//    full path, modification time and filesize
// If you pass inputHash, it must be a Hash object from the crypto library
//   and you must then call .digest() on it yourself when you're done
// If you don't pass inputHash, then one will be created automatically
//   and the digest will be returned to you in a Buffer object
// -----------------------------------------------------
function getPackageFileInfo(pkg: Package, fullPath: string) {
  const pkgJson = JSON.parse(JSON.stringify(require(fullPath)));
  delete pkgJson.versionHash;
  delete pkgJson.buildHash;
  delete pkgJson.currentHash;
  delete pkgJson.buildVersion;
  delete pkgJson.currentVersion;
  return `${JSON.stringify(pkgJson)}`;
}

export async function computeMetaHash(pkg: Package, input: string, inputHash: any = null) {
  const hash = inputHash ? inputHash : createHash('sha256');
  let fileInfo;
  if (fs.lstatSync(input).isDirectory()) {
    const info = await fsp.readdir(input, { withFileTypes: true });

    // construct a string from the modification date, the filename and the filesize
    for (const item of info) {
      if (
        ['cdk.out', 'cdk.context.json', 'node_modules'].indexOf(item.name) > -1
      ) {
        continue;
      }
      const fullPath = path.join(input, item.name);

      if (item.isFile()) {
        if (item.name === 'package.json') {
          fileInfo = getPackageFileInfo(pkg, fullPath);
          //hash.update(fileInfo);
        } else {
          const statInfo = await fsp.stat(fullPath);
          fileInfo = `${fullPath}:${statInfo.size}`;
        }
        // compute hash string name:size:mtime
        hash.update(fileInfo);
      } else if (item.isDirectory()) {
        // recursively walk sub-folders
        await computeMetaHash(pkg, fullPath, hash);
      }
    }
  } else {
    if (input.split('/').pop() === 'package.json') {
      fileInfo = getPackageFileInfo(pkg, input);
    } else {
      const statInfo = await fsp.stat(input);
      fileInfo = `${input}:${statInfo.size}`;
    }
    hash.update(fileInfo);
  }
  // if not being called recursively, get the digest and return it as the hash result
  if (!inputHash) {
    const digest = hash.digest('base64');
    return digest;
  }
}

export function deepClone(obj: any, hash = new WeakMap()): any {
  // Do not try to clone primitives or functions
  if (Object(obj) !== obj || obj instanceof Function) return obj;
  if (hash.has(obj)) return hash.get(obj); // Cyclic reference
  let result: any;
  try {
    // Try to run constructor (without arguments, as we don't know them)
    result = new obj.constructor();
  } catch (e) {
    // Constructor failed, create object without running the constructor
    result = Object.create(Object.getPrototypeOf(obj));
  }
  // Optional: support for some standard constructors (extend as desired)
  if (obj instanceof Map)
    Array.from(obj, ([key, val]) =>
      result.set(deepClone(key, hash), deepClone(val, hash)),
    );
  else if (obj instanceof Set)
    Array.from(obj, (key) => result.add(deepClone(key, hash)));
  // Register in hash
  hash.set(obj, result);
  // Clone and assign enumerable own properties recursively
  return Object.assign(
    result,
    ...Object.keys(obj).map((key) => ({ [key]: deepClone(obj[key], hash) })),
  );
}

export function readFiles(dirname: string, onFileContent: (dirname: string, filename: string) => void) {
  try {
    const filenames = fs.readdirSync(dirname)

    if (filenames) {
      filenames.forEach(function (filename) {
        const content = fs.readFileSync(join(dirname, filename), 'utf-8');
        onFileContent(filename, content);
      });
    }

  } catch (e) {
    CenvLog.single.catchLog(e);
  }
}

export enum PkgContextType {
  COMPLETE,
  PROCESSING,
}
export function getPkgContext(selectedPkg: Package, type: PkgContextType = PkgContextType.COMPLETE, failOnInvalid = true): { packages: Package[] } | false{
  let packages;
  const invalidStatePackages = [];
  if (selectedPkg?.stackName === 'GLOBAL') {
    packages = Object.values(Package.cache).filter((p: Package) => !p.isGlobal);
  } else {
    packages = [selectedPkg];
  }

  packages = packages.filter((p: Package) => {
    if (type === PkgContextType.PROCESSING) {
      switch(p.processStatus) {
        case ProcessStatus.READY:
        case ProcessStatus.HAS_PREREQS:
        case ProcessStatus.PROCESSING:
          return true;
        default:
          if (failOnInvalid) {
            invalidStatePackages.push(p);
          }
          return false;
      }
    } else if (type === PkgContextType.COMPLETE) {
      switch(p.processStatus) {
        case ProcessStatus.FAILED:
        case ProcessStatus.CANCELLED:
        case ProcessStatus.COMPLETED:
        case ProcessStatus.NONE:
          return true;

        default:
          if (failOnInvalid) {
            invalidStatePackages.push(p);
          }
          return false;
      }
    }

  });

  if (invalidStatePackages.length) {
    return false;
  }

  return { packages };
}

export function isOsSupported() {
  switch (os.platform()) {
    case 'darwin':
      return true;
    default:
      return false;
  }
}


// suite param must be first and must be included inside the suites.json file
function parseSuiteParam(params: any, options: any): { suite?: Suite, nonSuiteParams: string[] } {
  if (params?.length) {
    if (Suite.isSuite(params[0])) {
      options.suite = params.shift();
      const suite = new Suite(options.suite);
      const { packages, nonPackageParams } = parsePackageParams(params);
      if (packages.length) {
        CenvLog.single.catchLog(`can not include package params and suite flag`);
      }
      return { suite: suite, nonSuiteParams: nonPackageParams }
    }
  }
  return { nonSuiteParams: params };
}


// environment param must be first and must match existing environment variable "ENV"
async function parseEnvironmentParam(params: string[], options: any): Promise<{ environment?: Environment, nonEnvironmentParams: string[] }> {
  if (params?.length) {
    if (params[0] === process.env.ENV) {
      options.environment = params.shift();
      const { packages } = parsePackageParams(params);
      if (packages.length) {
        CenvLog.single.catchLog(`can not include package params and suite flag`);
      }

      return { environment: await Environment.fromName(options.environment), nonEnvironmentParams: params }
    }
  }
  return { nonEnvironmentParams: params };
}

function parsePackageParams(params: string[]): { packages: Package[], nonPackageParams: string[] }  {
  const packageNames: string[] = [];
  const newParams: string[] = [];
  while(params.length) {
    if (params[0].startsWith(`${Package.scopeName}/`) || Package.getRootPackageName() === params[0]) {
      packageNames.push(params.shift());
    } else {
      newParams.push(params.shift())
    }
  }
  return { packages: packageNames.map((p) => Package.fromPackageName(p)), nonPackageParams: newParams }
}

export function validateBaseOptions(deployCreateOptions: DashboardCreateOptions) {
  try {
    const { suite, environment, options, cmd  } = deployCreateOptions;
    const packages = deployCreateOptions.packages;
    if (options?.suite || options?.environment) {
      if (options?.userInterface === undefined && options?.cli === undefined) {
        options.cli = false;
      }
      options.dependencies = true;
    } else if (!Package.realPackagesLoaded()) {
      if (options?.userInterface === undefined && options?.cli === undefined) {
        if (!options?.dependencies) {
          options.cli = true;
        }
      }
    } else if (!!(options.cenv || options.key)) {
      options.cli = true;
    }
    options.userInterface = !options.cli;
    if (cmd) {
      if (!options.cenv && !options.key && !options.addKeyAccount && !options.stack && !options.parameters && !options.docker) {
        options.stack = options.parameters = options.docker = true;
      }
      if (!options.skipBuild) {
        options.build = true;
      }

    }
  } catch (e) {
    CenvLog.single.catchLog(e);
  }
}

export async function processEnvFile(envFile: string, envName: string) {
  const result = envFile.match(/^(.*)\/(\.cenv\.?([a-zA-Z0-9-\._]*)\.?(globals)?)$/);
  if (result?.length === 5) {
    const [ , servicePath, , configEnvironment ] = result;
    if (configEnvironment === envName || configEnvironment === "" || configEnvironment === 'globals') {
      CenvLog.info(infoBold(servicePath), 'service path');
      return {valid: true, servicePath, environment: envName};
    }
  }
  return { valid: false }
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
    if (envFile.valid)
      servicePaths.add(envFile.servicePath)
  });
  const paths : string[] = Array.from(servicePaths);
  const lernaPath = await execCmd('./', `git rev-parse --show-toplevel`, undefined) as string;

  for (let i = 0; i < paths.length; i++) {
    const servicePath = paths[i].toString();
    console.log('change to service dir', path.join('./',servicePath))
    process.chdir(path.join('./', servicePath));

    // at this point we have to figure out which application we are updating
    // we know the environment because of the branch but we don't know the application
    // and there is no settings file to tell us
    // so we have to look at the package.json and see if there is a cdk application
    if(existsSync('package.json')) {
      const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
      if (!pkg?.cenv?.ApplicationName) {
        pkg.cenv = { ApplicationName: pkg.name, GlobalPath: CenvFiles.GlobalPath}
      }
      await func(pkg.cenv.ApplicationName, environment);
    } else {
      CenvLog.single.errorLog(`No package.json for ${path}`);
    }

    console.log('cwd', process.cwd());
    console.log('change to lerna', )
    process.chdir(lernaPath)
  }
}

async function execInit(application: string, environment: string) {
  //await Cenv.initVars({defaults: true, environment, application, push: true, force: true});
}

export async function processEnvFiles(environment: string, added: string[], changed: string[], deleted: string[]) {
  if (changed) {
    await execEnvironment(environment, changed, execInit);
  }
  if (deleted) {
    async function execDestroy(application: string) {
      await deleteCenvData(
        application,
        false,
        true,
      );
    }

    await execEnvironment(environment, deleted, execDestroy);
  }
}

export async function parseCmdParams(params: string[], options: any, cmd?: ProcessMode):
  Promise<{ parsedParams: string[], validatedOptions: any, packages?: Package[], suite?: Suite, environment?: Environment }> {

  // suite based command as parameter
  if (params.length && Suite.isSuite(params[0])) {
    const {suite, nonSuiteParams} = parseSuiteParam(params, options);
    if (suite) {
      options.suite = suite.name;
      validateBaseOptions({suite, options, cmd});
      return {packages: suite.packages, suite, parsedParams: nonSuiteParams, validatedOptions: options}
    }
  }

  // application based command as parameter
  const paramCount = params.length;
  const { packages, nonPackageParams } = parsePackageParams(params);

  if (packages.length) {
    validateBaseOptions({ packages, options, cmd } );
    return { packages, parsedParams: nonPackageParams, validatedOptions: options}
  } else if (nonPackageParams.length !== paramCount) {
    CenvLog.single.catchLog(`a param passed in looks like a package but was not loaded`);
  }

  let pkgs = [];
  if (options.localPackageAccepted) {
    const packageFile = path.resolve('./package.json')
    if (existsSync(packageFile)) {
      const packageName = require(packageFile).name;
      const pkg = Package.fromPackageName(packageName);
      pkg.local = true;
      pkg.root = options.root;
      pkgs.push(pkg)
    }
  }

  if (!packages.length) {
    if (Package.defaultSuite) {
      options.suite = Package.defaultSuite;
      const suite = new Suite(options.suite);
      options.suite = suite.name;
      pkgs = suite.packages;
      validateBaseOptions({ suite, options, cmd } );
    } else {
      CenvLog.err(`No valid suite or packages were provided and no valid defaultSuite was configured in the root cenv.json file`);
      process.exit(0);
    }
  } else {
    validateBaseOptions({packages: pkgs, options, cmd});
  }
  return { packages: pkgs, parsedParams: nonPackageParams, validatedOptions: options };
}


export async function parseParamsExec(params: string[], options: any, asyncExecFunc: (ctx: any, params: any, options: any) => Promise<PackageCmd>): Promise<PackageCmd[]> {
  try {

    const { packages, parsedParams, validatedOptions } = await parseCmdParams(params, options);
    const result: PackageCmd[] = [];
    if (packages?.length) {
      for (let i = 0; i < packages?.length;) {
        const app = packages.shift();
        if (app.chDir()) {
          const ctx: any = await CenvParams.getParamsContext();
          const resCmd = await asyncExecFunc(ctx, parsedParams, validatedOptions);
          result.push(resCmd);
          if (resCmd?.code !== 0) {
            return result;
          }
        }
      }
      return result;
    }

  } catch(e) {
    CenvLog.single.errorLog(e.stack);
  }
}

export function pbcopy(data: any) {
  const proc = child_process.spawn('pbcopy');
  proc.stdin.write(data);
  proc.stdin.end();
}
