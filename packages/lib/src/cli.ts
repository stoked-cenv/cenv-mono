import {Cenv, CommandInfo} from './cenv';
import {Package} from './package/package';
import {Suite} from './suite';
import {Environment} from './environment';
import path from 'path';
import {existsSync} from 'fs';
import {CenvLog, LogLevel} from './log';
import {DashboardCreateOptions} from './params';
import {CenvFiles} from './file';
import {Version} from './version';
import {Config} from './config';

export async function parseCmdParams(params: string[], options: any, cmdInfo: CommandInfo): Promise<{
  parsedParams: string[], validatedOptions: any, packages?: Package[], suite?: Suite, environment?: Environment
}> {

  Cenv.frozenParams = cmdInfo.frozenParams;
  if (!cmdInfo.allowPackages) {
    validateBaseOptions({packages: [], options, cmd: cmdInfo.deploymentMode});
    return {packages: [], parsedParams: params, validatedOptions: options};
  }

  // suite based command as parameter
  if (params.length && Suite.isSuite(params[0])) {
    const {suite, nonSuiteParams} = parseSuiteParam(params, options);
    if (suite) {
      options.suite = suite.name;
      validateBaseOptions({suite: suite.name, options, cmd: cmdInfo.deploymentMode});
      return {packages: suite.packages, suite, parsedParams: nonSuiteParams, validatedOptions: options};
    }
  }

  // application based command as parameter
  const paramCount = params.length;
  const {packages, nonPackageParams} = parsePackageParams(params);

  if (packages.length) {
    validateBaseOptions({packages, options, cmd: cmdInfo.deploymentMode});
    return {packages, parsedParams: nonPackageParams, validatedOptions: options};
  } else if (nonPackageParams.length !== paramCount) {
    CenvLog.single.catchLog(`a param passed in looks like a package but was not loaded`);
  }

  let pkgs: Package[] = [];
  if (cmdInfo.allowLocalPackage) {
    const root = CenvFiles.getMonoRoot();
    const isMonoRoot = root && root === process.cwd();
    if ((isMonoRoot && cmdInfo.allowRootPackage) || !isMonoRoot) {
      const packageFile = path.resolve('./package.json');
      if (existsSync(packageFile)) {
        const packageName = require(packageFile).name;
        const pkg = Package.fromPackageName(packageName, true);
        pkg.root = options.root;
        if (!pkg.invalid) {
          pkgs.push(pkg);
        }
      }
    }
  }

  if (!pkgs.length) {
    options.suite = Suite.defaultSuite;
    const suite = new Suite(options.suite);
    options.suite = suite.name;
    pkgs = suite.packages;
    validateBaseOptions({suite: suite.name, options, cmd: cmdInfo.deploymentMode});
  } else {
    validateBaseOptions({packages: pkgs, options, cmd: cmdInfo.deploymentMode});
  }
  return {packages: pkgs, parsedParams: nonPackageParams, validatedOptions: options};
}

// suite param must be first and must be included inside the suites.json file
function parseSuiteParam(params: any, options: any): { suite?: Suite, nonSuiteParams: string[] } {
  if (params?.length) {
    if (Suite.isSuite(params[0])) {
      options.suite = params.shift();
      const suite = new Suite(options.suite);
      const {packages, nonPackageParams} = parsePackageParams(params);
      if (packages.length) {
        CenvLog.single.catchLog(`can not include package params and suite flag`);
      }
      return {suite: suite, nonSuiteParams: nonPackageParams};
    }
  }
  return {nonSuiteParams: params};
}

function parsePackageParams(params: string[]): { packages: Package[], nonPackageParams: string[] } {
  const packageNames: string[] = [];
  const newParams: string[] = [];
  while (params.length) {
    const potentialPackageName = params.shift() as string;
    if (CenvFiles.packagePaths[potentialPackageName]) {
      packageNames.push(potentialPackageName);
    } else {
      newParams.push(potentialPackageName);
    }
  }
  return {packages: packageNames.map((p) => Package.fromPackageName(p)), nonPackageParams: newParams};
}

export async function cmdInit(options: any, cmdInfo: CommandInfo): Promise<boolean> {
  try {
    CenvFiles.setPaths();
    if (options?.logLevel || process.env.CENV_LOG_LEVEL) {
      options.logLevel = process.env.CENV_LOG_LEVEL?.toUpperCase() || options?.logLevel?.toUpperCase();
      const {logLevel}: { logLevel: keyof typeof LogLevel } = options;
      process.env.CENV_LOG_LEVEL = LogLevel[logLevel];
      CenvLog.logLevel = LogLevel[logLevel];
      if (![LogLevel.INFO, LogLevel.MINIMAL].includes(CenvLog.logLevel)) {
        CenvLog.single.stdLog('CENV LOG LEVEL: ' + CenvLog.logLevel);
      }
    } else {
      process.env.CENV_LOG_LEVEL = LogLevel.INFO;
      CenvLog.logLevel = LogLevel.INFO;
    }

    if (!process.env.CENV_VERSION) {
      await Version.getVersion('@stoked-cenv/cli');
      await Version.getVersion('@stoked-cenv/lib');
      await Version.getVersion('@stoked-cenv/ui');
    }

    if (cmdInfo.configRequired) {

      Cenv.config = new Config()
      await Cenv.config.loadProfile(options?.profile);
      options.args = Cenv.config?.envVars?.all;
    }

    if (!cmdInfo.cenvRootRequired) {
      return true;
    }

    const monoRoot = CenvFiles.getMonoRoot();
    if (!monoRoot) {
      CenvLog.single.alertLog(`the cwd "${process.cwd()}" is not located inside a cenv folder.. run "cenv init" to initialize the current directory as a cenv project or call 'cenv new My-New-Cenv-App'`);
      process.exit(902);
    }
    const cenvConfigPath = path.resolve(monoRoot, 'cenv.json');
    if (existsSync(cenvConfigPath)) {
      const cenvConfig = require(cenvConfigPath);
      Cenv.defaultSuite = cenvConfig.defaultSuite;
      Cenv.scopeName = cenvConfig.scope;
      Cenv.suites = cenvConfig.suites;
      const suitesPath = Suite.suitePath();
      if (suitesPath) {
        if (Cenv.suites) {
          CenvLog.single.catchLog('a suites.json file is not supported when there is also a suites property in the cenv.json file');
          process.exit(687);
        } else {
          Cenv.suites = require(suitesPath);
        }
      }
      Cenv.globalPackage = cenvConfig.globalPackage;
      Cenv.primaryPackagePath = cenvConfig.primaryPackagePath;
      if (cenvConfig.globalPackage) {
        const packageGlobalPath = CenvFiles.packagePath(cenvConfig.globalPackage);
        if (!packageGlobalPath || !existsSync(packageGlobalPath)) {
          CenvLog.single.infoLog(`globals could not be loaded from the data provided in the cenv.json definition file ${cenvConfig.globalPackage} (using scope and globals property)`);
        } else if (packageGlobalPath) {
          CenvFiles.setGlobalPath(path.join(packageGlobalPath, CenvFiles.PATH));
        }
      }
    } else {
      CenvLog.single.infoLog('no cenv.json configuration file exists at the root');
      return false;
    }
  } catch (e) {
    CenvLog.single.catchLog(e);
  }
  return true;
}

export function validateBaseOptions(deployCreateOptions: DashboardCreateOptions) {
  try {
    const {suite, environment, options, cmd} = deployCreateOptions;
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
    } else if (options.cenv || options.key) {
      options.cli = true;
    }
    options.userInterface = !options.cli;
    if (cmd) {
      if (!options.cenv && !options.key && !options.addKeyAccount && !options.stack && !options.parameters && !options.docker && !options.exec && !options.lib) {
        options.stack = options.parameters = options.docker = options.lib = options.exec = true;
      }
      if (!options.skipBuild) {
        options.build = true;
      }

    }
  } catch (e) {
    CenvLog.single.catchLog(e);
  }
}
