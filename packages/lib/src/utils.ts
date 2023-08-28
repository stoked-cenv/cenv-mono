import * as path from 'path';
import { join } from 'path';
import * as child from 'child_process';
import { lstatSync, readdirSync, readFileSync } from 'fs';
import * as os from 'os';
import { Package, PackageCmd, ProcessStatus } from './package/package';
import * as fsp from 'fs/promises';
import * as semver from 'semver';
import { RangeOptions } from 'semver';
import { createHash } from 'crypto';
import { Cenv, StackProc } from './cenv';
import { cancelUpdateStack, deleteStack, describeStacks } from './aws/cloudformation';
import { CenvLog } from './log';

function stringOrStringArrayValid(value: string | string[]): boolean {
  return typeof value === 'string' ? !!value : value && value.length > 0;
}

export function inputArgsToEnvVars(inputArgs: any) {
  let args = '';
  if (inputArgs) {
    for (const [key, value] of Object.entries(inputArgs)) {
      if (value) {
        args += `${key}=${value} `;
      }
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

export function enumKeys<O extends object, K extends keyof O = keyof O>(obj: O): K[] {
  return Object.keys(obj).filter(k => Number.isNaN(+k)) as K[];
}

function printIfExists(color = true, envVar: string) {
  if (process.env[envVar]) {
    let isClear = true;
    if (['pass', 'key', 'secret'].some((v) => envVar.toLowerCase().includes(v))) {
      isClear = false;
    }

    if (color) {
      CenvLog.single.infoLog(`export ${envVar}=${CenvLog.colors.infoBold(isClear ? process.env[envVar] : '****')}`);
    } else {
      console.log(`export ${envVar}=${CenvLog.colors.infoBold(isClear ? process.env[envVar] : '****')}`);
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
  startTime?: [number, number];
  final?: [number, number];
  finalElapsed?: string;
  note: string;
  format: string;
  silent: boolean;
  running = false;

  constructor(note: string, format: string, start = false, silent = true) {
    this.format = format;
    this.note = note;
    this.silent = silent;
    if (start) {
      this.start();
    }
  }

  get elapsed() {
    if (this.running) {
      return elapsedBase(this.startTime as [number, number], this.format, this.note, this.silent) + this.format[0];
    } else if (this.finalElapsed) {
      return `${this.finalElapsed}${this.format[0]}`;
    } else {
      return '';
    }
  }

  state() {
    const res: any = {
      elapsed: undefined, format: this.format, note: this.note, final: this.final,
    };

    res.elapsed = this.elapsed;

    return res;
  }

  stop() {
    if (this.running) {
      this.finalElapsed = elapsedBase(this.startTime as [number, number], this.format, this.note, this.silent);
      this.final = process.hrtime();
      this.running = false;
    }
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

export const sleep = (seconds: number) => new Promise((r) => setTimeout(r, seconds * 1000));

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
        if (groupIndex !== 0) {
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
    for (const dep of Array.from(dependencies)) {
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

export function randomRange(min: number, max: number) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min) + min);
}

export function printFlag(options: Record<string, any>, flag: string) {
  return options[flag] ? ` --${flag}` : '';
}

export async function showPkgCmdsResult(cmds: PackageCmd[]) {
  if (!cmds) {
    return;
  }
  const failures = cmds.filter((c) => c?.code !== 0);
  const success = cmds.filter((c) => c?.code === 0);
  success.map((f) => {
    f ? CenvLog.single.infoLog(`${f?.cmd} exit(${f?.code})\n`, f?.stackName) : '';
  });
  if (failures?.length) {
    failures.map((f) => f ? CenvLog.single.errorLog(`${f?.cmd} ${f?.code}\n`, f?.stackName) : '');
    process.exit(9);
  }
}

export function clamp(number: number, min: number, max: number) {
  return Math.min(Math.max(number, min), max);
}

const killedStackCmds: Record<string, string[]> = {};

export async function killStackProcesses(StackName: string) {
  for (const [pid, stackProc] of Object.entries(Cenv.processes) as [string, StackProc][]) {
    if (stackProc.stackName === StackName) {
      CenvLog.alert(`${CenvLog.colors.errorBold(stackProc.cmd)} pid: ${stackProc.proc.pid}`, 'kill child process');
      const killSuccess = stackProc.proc.kill();

      if (stackProc.cmd.startsWith('cdk deploy')) {
        const stacks = await describeStacks(StackName);
        if (stacks) {
          const status = stacks[0].StackStatus;
          CenvLog.single.alertLog(`the current status is ${status}`, 'killed cdk deploy process');
          if (status === 'UPDATE_IN_PROGRESS') {
            CenvLog.single.alertLog(`now attempting to cancel the cloudformation update`, 'killed cdk deploy process');
            await cancelUpdateStack(StackName);
          } else if (status === 'CREATE_IN_PROGRESS') {
            CenvLog.single.alertLog(`now attempting to destroy the cloud formation creation`, 'killed cdk deploy process');
            await deleteStack(StackName);
          }
        }
      }
      if (killSuccess && pid) {
        delete Cenv.processes[Number(pid)];
      }
    }

  }
  Cenv.processes = {};
  delete Cenv.runningProcesses;
}

export function killRunningProcesses() {
  for (const [pid, stackProc] of Object.entries(Cenv.processes)) {
    CenvLog.err(`${CenvLog.colors.errorBold(stackProc.cmd)} pid: ${stackProc.proc.pid}`, 'kill child process');
    const killSuccess = stackProc.proc.kill();
    if (killSuccess) {
      if (!killedStackCmds[stackProc.stackName as string]) {
        killedStackCmds[stackProc.stackName as string] = [];
      }
      killedStackCmds[stackProc.stackName as string].push(stackProc.cmd);
    }
  }
  Cenv.processes = {};
  delete Cenv.runningProcesses;
}

export function destroyUI() {
  if (Cenv.dashboard) {
    if (Cenv.dashboard.program) {
      Cenv.dashboard.program.destroy();
      console.log('Cenv.dashboard.screen?.destroy(kk)');
    }
    if (Cenv.dashboard.screen) {
      Cenv.dashboard.screen?.destroy();
      console.log('Cenv.dashboard.screen?.destroy(kk)');
    }
    delete Cenv.dashboard;
    console.log('delete Cenv.dashboard');
  }
}

let throwStackAtEnd = true;

export function cleanup(eventType: string, error?: Error, exitCode?: number) {
  destroyUI();
  if (throwStackAtEnd && process.env.CENV_LOG_LEVEL === 'VERBOSE') {
    console.log('cleanup', new Error().stack);
    throwStackAtEnd = false;
  }

  if (process.env.CENV_LOG_LEVEL === 'VERBOSE') {
    process.argv.shift();
    process.argv[0] = process.argv[0].split('/').pop() as string;
    console.log(`[${eventType}] ${process.argv.join(' ')}`);
  }

  //killRunningProcesses();
  /*
    if (error) {
      console.error(error);
    }

    if (eventType !== 'exit') {
      const killedCmds = Object.values(killedStackCmds);
      const killedCdkCommands: string[] = [];
      if (killedCmds.length) {
        for (const cmd in killedCmds.flat(1)) {
          if (cmd.indexOf('cdk ') !== -1) {
            killedCdkCommands.push(cmd);
          }
        }
      }
      if (killedCdkCommands.length) {
        let question = 'process.exit() called while the following cdk child processes were running: \n';
        for (const cmd in killedCdkCommands) {
          question += '\t - ' + cmd + '\n';
        }
        question += '\nWould you like to cancel these stacks?';
        Promise.resolve(ioYesOrNo(question))
          .then( (shouldCancelStacks: boolean) => {
            if (shouldCancelStacks) {
              Promise.resolve(Promise.all(Object.keys(killedStackCmds).map((stackName) => cancelUpdateStack(stackName))))
                .catch((ex)=>{
                  console.error('error while canceling cdk stack', ex)
                })
                .then(() => {
                  process.exit(exitCode);
                });
            }
          })
          .catch((ex) => {
            console.error('error on yes or no input', ex)
          })
      } else if (exitCode) {
        process.exit(exitCode);
      }
    }
    */
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
  if (lstatSync(input).isDirectory()) {
    const info = await fsp.readdir(input, { withFileTypes: true });

    // construct a string from the modification date, the filename and the filesize
    for (const item of info) {
      if (['cdk.out', 'cdk.context.json', 'node_modules'].indexOf(item.name) > -1) {
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
  if (Object(obj) !== obj || obj instanceof Function) {
    return obj;
  }
  if (hash.has(obj)) {
    return hash.get(obj);
  } // Cyclic reference
  let result: any;
  try {
    // Try to run constructor (without arguments, as we don't know them)
    result = new obj.constructor();
  } catch (e) {
    // Constructor failed, create object without running the constructor
    result = Object.create(Object.getPrototypeOf(obj));
  }
  // Optional: support for some standard constructors (extend as desired)
  if (obj instanceof Map) {
    Array.from(obj, ([key, val]) => result.set(deepClone(key, hash), deepClone(val, hash)));
  } else if (obj instanceof Set) {
    Array.from(obj, (key) => result.add(deepClone(key, hash)));
  }
  // Register in hash
  hash.set(obj, result);
  // Clone and assign enumerable own properties recursively
  return Object.assign(result, ...Object.keys(obj).map((key) => ({ [key]: deepClone(obj[key], hash) })));
}

export function readFiles(dirname: string, onFileContent: (dirname: string, filename: string) => void) {
  try {
    const filenames = readdirSync(dirname);

    if (filenames) {
      filenames.forEach(function(filename) {
        const content = readFileSync(join(dirname, filename.toString()), 'utf-8');
        onFileContent(filename.toString(), content);
      });
    }

  } catch (e) {
    CenvLog.single.catchLog(e);
  }
}

export enum PkgContextType {
  COMPLETE, PROCESSING,
}

export function getPkgContext(selectedPkg: Package, type: PkgContextType = PkgContextType.COMPLETE, failOnInvalid = true): {
  packages: Package[]
} | false {
  let packages;
  const invalidStatePackages: Package[] = [];
  if (selectedPkg?.stackName === 'GLOBAL') {
    packages = Package.getPackages();
  } else {
    packages = [selectedPkg];
  }

  packages = packages.filter((p: Package) => {
    if (type === PkgContextType.PROCESSING) {
      switch (p.processStatus) {
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
      switch (p.processStatus) {
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
  Cenv.dashboard.debugLocal('type', type)
  Cenv.dashboard.debugLocal('failOnInvalid', failOnInvalid)
  Cenv.dashboard.debugLocal('packages', packages.map((p: Package) => p.packageName).join(','))
  Cenv.dashboard.debugLocal('invalidStatePackages', invalidStatePackages.map((p: Package) => p.packageName).join(','))
  Cenv.dashboard.debugLocal('\n\n')
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

export function getOs() {
  return { platform: os.platform(), arch: os.arch(), version: os.version(), release: os.release(), type: os.type() };
}

export function pbcopy(data: any) {
  const proc = child.spawn('pbcopy');
  proc.stdin.write(data);
  proc.stdin.end();
}

export function onlyUnique(value: any, index: number, array: any[]) {
  return array.indexOf(value) === index;
}

export function removeScope(packageName: string) {
  const regex = /\@.*?\//m;
  return packageName.replace(regex, '');
}

export function semVerParse(version: string | semver.SemVer | null, opt?: RangeOptions) {
  const parsed = semver.parse(version, opt);
  if (!parsed) {
    CenvLog.single.errorLog(`the provided version "${version}" is not a valid semver version`);
    process.exit(-33);
  }
  return parsed;
}
