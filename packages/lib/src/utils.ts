import * as path from 'path';
import child_process, { exec } from 'child_process';
import { startCenv, ClientMode } from './aws/appConfigData';
import { info, infoAlert, infoBold, LogLevel, CenvLog } from './log';
import fs, { existsSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { hostname } from 'os';
import { CenvParams } from './params';
import {PackageCmd, Package, ProcessStatus} from './package/package';
import { join } from 'path';
import chalk from 'chalk';
import * as fsp from 'fs/promises';
import { createHash } from 'crypto';

function stringOrStringArrayValid(value: string | string[]): boolean {
  return isString(value) ? !!value : value && value.length > 0;
}

export function inputArgsToEnvVars(inputArgs) {
  let args = '';
  if (inputArgs) {
    for (const [key, value] of Object.entries(inputArgs)) {
      if (value) args += `${key}=${value} `;
    }
  }
  return args.trim();
}

export function isString(value) {
  return typeof value === 'string' || value instanceof String;
}

export function stringToArray(value: string | string[]): string[] {
  return isString(value) ? [value as string] : (value as string[]);
}

const packagePaths = {};
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

function printIfExists(color = true, envVar) {
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

export function printApp(cmd, envVars, cenvVars) {
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
  returnRegExp?: RegExp;
  pipedOutput?: boolean;
  pkgCmd?: PackageCmd;
  silent?: boolean;
}

function spawnInfo(options, chunk, output, pkg) {
  if (options.returnOutput) {
    if (options?.returnRegExp) {
      const regex = new RegExp(options?.returnRegExp, 'gim');

      let m;
      while ((m = regex.exec(chunk)) !== null) {
        // This is necessary to avoid infinite loops with zero-width matches
        if (m.index === regex.lastIndex) {
          regex.lastIndex++;
        }

        // The result can be accessed through the `m`-variable.
        m.forEach((match, groupIndex) => {
          output.push(match);
        });
      }
      //console.log('output regex match', output)
    } else {
      output += chunk;
    }
  } else {
    CenvLog.single.infoLog(chunk, pkg?.stackName);
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
    returnRegExp: undefined,
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

  function err(...text: string[]) {
    if (options.silent) {
      return;
    }
    if (cmdLog) {
      cmdLog.err(...text);
    } else if (packageInfo) {
      packageInfo.err(...text);
    } else if (!options.silent) {
      CenvLog.single.errorLog(text)
    }
  }

  try {
    const relativeDir = path.relative(process.cwd(), path.resolve(folder));
    const newCwd: string = './' + relativeDir;
    return new Promise(async (resolve, reject) => {
      if (relativeDir !== '') {
        process.chdir(newCwd);
      }
      let configVars = null;
      let configVarDisplay = null;
      if (options.getCenvVars && !packageInfo) {
        const useCurrentDirectory = existsSync('.cenv');
        const useParentDirectory = useCurrentDirectory
          ? false
          : existsSync('../.cenv');
        const skipCenv = !useCurrentDirectory && !useParentDirectory;
        if (useParentDirectory) {
          process.chdir('../');
        }
        if (!skipCenv) {
          configVars = await startCenv(
            ClientMode.REMOTE_ON_STARTUP,
            '0 * * * *',
            true,
          );
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
      const output: any = options?.returnRegExp ? [] : '';
      const proc = child_process.spawn(cmdFinal, spawnArgs, opt);
      const processName = `${
        packageInfo ? `[${packageInfo.stackName}] ` : ''
      }${cmd}`;
      CenvParams.addSpawnedProcess(packageInfo.stackName, processName, proc);

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
          if (options?.redirectStdErrToStdOut) {
            spawnInfo(options, chunk, output, packageInfo);
          } else {
            err(chunk, packageInfo ? packageInfo.stackName : undefined)
          }
        });
      }
      // proc.on('close', function (code) { });
      proc.on('error', function (code) {
        err(`error ${code}`)
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
            if (code !== 0) {
              reject(returnOutput);
            } else {
              resolve(returnOutput);
            }
          }
        } else if (cmdLog) {
          !cmdLog.result(code) ? reject(code) : resolve(code);
        } else if (code !== 0) {
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
    err(`${e?.stack || e}`);
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
  packageInfo = undefined,
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

  let envVarDisplay, envVarFinal;
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

export function fromDir(
  startPath,
  filter,
  foundMsg = '-- found: ',
  recursive = false,
) {
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
  dir,
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

export function exitWithoutTags(tags) {
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

function elapsedBase(start, format = 'seconds', note, silent = false) {
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
  start: [number, number];
  final: [number, number];
  finalElapsed: string;
  note: string;
  format: string;
  silent: boolean;

  constructor(note, format, silent = false) {
    this.start = process.hrtime();
    this.format = format;
    this.note = note;
    this.silent = silent;
  }

  elapsed(stop = false, reset = false) {
    if (process.env.TIMING) {
      const res = {
        elapsed: undefined,
        format: this.format,
        note: this.note,
        final: this.final,
      };
      res.elapsed = this.finalElapsed
        ? this.finalElapsed
        : elapsedBase(this.start, this.format, this.note, this.silent);
      if (stop) {
        this.finalElapsed = res.elapsed;
        this.final = process.hrtime();
        res.final = this.final;
      }
      if (reset) {
        this.reset();
      }
      return res;
    }
  }

  reset() {
    this.start = process.hrtime();
  }

  stop() {
    return this.elapsed(true);
  }

  static start = process.hrtime();

  static elapsed(note, format = 'seconds') {
    if (process.env.TIMING) {
      const res = elapsedBase(this.start, format, note);
      this.reset();
      return res;
    }
  }

  static reset() {
    this.start = process.hrtime(); // reset the timer
  }
}

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
}

export const sleep = (seconds: number) =>
  new Promise((r) => setTimeout(r, seconds * 1000));

export function simplify(yamlData) {
  const result = {};
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

export function expandTemplateVars(baseVars) {
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
  function processTree(tree) {
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

export async function deleteFiles(search, options) {
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

export function randomRange(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min) + min);
}

export function printFlag(options, flag) {
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

export function clamp(number, min, max) {
  return Math.min(Math.max(number, min), max);
}

export function killRunningProcesses() {
  for (const [procTitle, procData] of Object.entries(CenvParams.runningProcesses) as [string, { cmd: string, proc: child_process.ChildProcess }][]) {
    if (procData.proc.exitCode === null) {
      console.log(`killing child process: ${procTitle}`);
      procData.proc.kill();
    }
  }
}

export function destroyUI() {
  if (CenvParams.dashboard) {
    CenvParams.dashboard.screen?.destroy();
    delete CenvParams.dashboard;
  }
  if (CenvParams.dashboard) {
    CenvParams.dashboard.screen?.destroy();
    delete CenvParams.dashboard;
  }
}

export function cleanup(eventType) {
  destroyUI();

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
function getPackageFileInfo(pkg, fullPath) {
  const pkgJson = JSON.parse(JSON.stringify(require(fullPath)));
  delete pkgJson.versionHash;
  delete pkgJson.buildHash;
  delete pkgJson.currentHash;
  delete pkgJson.buildVersion;
  delete pkgJson.currentVersion;
  return `${JSON.stringify(pkgJson)}`;
}

export async function computeMetaHash(pkg, input, inputHash = null) {
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

export function deepClone(obj, hash = new WeakMap()) {
  // Do not try to clone primitives or functions
  if (Object(obj) !== obj || obj instanceof Function) return obj;
  if (hash.has(obj)) return hash.get(obj); // Cyclic reference
  let result;
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

export function readFiles(dirname, onFileContent) {
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
        case ProcessStatus.SKIPPED:
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
