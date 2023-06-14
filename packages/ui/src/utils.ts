import * as path from 'path';
import {
  CenvLog,
  PackageCmd,
  CenvParams,
  Package, infoBold, CenvFiles, deleteCenvData, execCmd, LogLevel, getMonoRoot, packagePath,
} from '@stoked-cenv/cenv-lib';
import { existsSync, readFileSync } from 'fs';
import { Dashboard } from './ui/dashboard'
import { Deployment, DeploymentMode } from './deployment';
import { Suite } from './suite';
import { Environment } from './environment';
import child_process from 'child_process';
import { Cenv } from './cenv';

// suite param must be first and must be included inside the suites.json file
function parseSuiteParam(params, options): { suite?: Suite, nonSuiteParams: string[] } {
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

export function validateBaseOptions({packages = [], suite = undefined, environment = undefined}: {
  packages?: Package[], suite?: Suite, environment?: Environment},
  options: any,
  cmd?: DeploymentMode
) {
  try {
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
    if (options?.userInterface && !process.env.CENV_SPAWNED) {
      CenvParams.dashboard = new Dashboard({packages, suite, environment, cmd}, options);
      process.env.CENV_DEFAULTS = 'true';
    }
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
  let processList = [];
  if (fileList?.length > 0) {
    processList = await Promise.all(fileList.map(async (envFile) => {
      return await processEnvFile(envFile, environment);
    }));
  }
  const servicePaths = new Set<string>();
  processList.map((envFile) => {
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

export async function processEnvFiles(environment, added, changed, deleted) {
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

export async function parseCmdParams(params, options, cmd?: DeploymentMode):
  Promise<{ parsedParams: string[], validatedOptions: any, packages?: Package[], suite?: Suite, environment?: Environment }> {
  // suite or environment based command passed in using the suite or environment flags
  if (options.suite || options.environment) {
    const suite = options.suite ? new Suite(options.suite) : undefined;
    const environment = options.environment ? new Environment(options.environment) : undefined;
    validateBaseOptions({ environment, suite }, options, cmd);
    return { parsedParams: params, validatedOptions: options, packages: suite?.packages || environment?.packages, suite, environment }
  }
  // suite based command as parameter
  const { suite, nonSuiteParams } = parseSuiteParam(params, options);
  if (suite) {
    options.suite = suite.name;
    validateBaseOptions({ suite }, options, cmd)
    return { packages: suite.packages, suite, parsedParams: nonSuiteParams, validatedOptions: options}
  }
  // environment based command as parameter
  const { environment, nonEnvironmentParams } = await parseEnvironmentParam(params, options);
  if (environment) {
    options.environment = environment.name;
    validateBaseOptions({ environment }, options, cmd)
    return { packages: environment.packages, environment, parsedParams: nonEnvironmentParams, validatedOptions: options}
  }
  // application based command as parameter
  const paramCount = params.length;
  const { packages, nonPackageParams } = parsePackageParams(params);

  if (packages.length) {
    validateBaseOptions({ packages }, options, cmd)
    return { packages, parsedParams: nonPackageParams, validatedOptions: options}
  } else if (nonPackageParams.length !== paramCount) {
    CenvLog.single.catchLog(`a param passed in looks like a package but was not loaded`);
  }

  const pkgs = [];
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
  validateBaseOptions({}, options, cmd)
  return { packages: pkgs, parsedParams: nonPackageParams, validatedOptions: options };
}


export async function parseParamsExec(params, options, asyncExecFunc: (ctx: any, params: any, options: any) => Promise<PackageCmd>): Promise<PackageCmd[]> {
  try {

    const { packages, parsedParams, validatedOptions } = await parseCmdParams(params, options);
    const result: PackageCmd[] = [];
    if (packages?.length) {
      for (let i = 0; i < packages?.length;) {
        const app = packages.shift();
        if (app.chDir()) {
          const ctx: any = await CenvParams.getContext();
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

export function pbcopy(data) {
  const proc = child_process.spawn('pbcopy');
  proc.stdin.write(data);
  proc.stdin.end();
}
