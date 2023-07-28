import {Command, Option} from 'nest-commander';
import {
  Cenv,
  CenvFiles,
  CenvLog,
  CenvParams,
  colors,
  getConfig,
  getParams,
  Package,
  ParamsCommandOptions,
  validateCount,
  variableTypes
} from '@stoked-cenv/lib'

import {BaseCommand} from './base.command'

enum ParamCommands {
  init = 'init', deploy = 'deploy', pull = 'pull', fix = 'fix', materialize = 'materialize'
}

@Command({
           name: 'params', description: 'Init, deploy, and display package parameters',
         })
export default class ParamsCommand extends BaseCommand {
  localPackageAccepted = true;

  @Option({
            flags: '-ll, --log-level, <logLevel>', description: `Logging mode`,
          }) parseLogLevel(val: string): string {
    return val;
  }

  @Option({
            name: 'app',
            flags: '-a, --app',
            description: 'Displays all app parameters. App parameters are the same across all environments and are not used in other applications.',
          }) parseConfig(val: string): string {
    return val;
  }

  @Option({
            name: 'environment',
            flags: '-e, --environment',
            description: 'Displays environment parameters. Environment parameters are unique to each environment and are not used in other applications.',
          }) parseEnvironment(val: string): string {
    return val;
  }

  @Option({
            name: 'global',
            flags: '-g, --global',
            description: 'Displays global parameters. Global parameters are available to all applications in all environments.',
          }) parseGlobal(val: string): string {
    return val;
  }

  @Option({
            name: 'globalEnv',
            flags: '-ge, --global-env',
            description: 'Displays global environment parameters. Global environment parameters are available to all applications in a specific environment.',
          }) parseGlobalEnv(val: string): string {
    return val;
  }

  @Option({
            name: 'detail',
            flags: '-d, --detail',
            description: 'Print all the variable meta data including path, value, and type.',
          }) parseDetail(val: boolean): boolean {
    return val;
  }

  @Option({
            name: 'simple',
            flags: '-s, --simple',
            description: 'Print only environment variable and value.',
            defaultValue: true
          }) parseSimple(val: boolean): boolean {
    return val;
  }

  @Option({
            name: 'envToParams',
            flags: '-ep, --env-to-params',
            description: 'Import .env file as system parameters on init.',
          }) parseEnvToParams(val: boolean): boolean {
    return val;
  }

  @Option({
            name: 'decrypted',
            flags: '-de, --decrypted',
            description: 'Display decrypted values on SecureString blessed.',
          }) parseEncrypted(val: boolean): boolean {
    return val;
  }

  @Option({
            name: 'deployed', flags: '-D, --deployed', description: 'Print variable data that has been deployed.',
          }) parseDeployed(val: boolean): boolean {
    return val;
  }

  @Option({
            flags: '--profile, <profile>', description: `Profile to use for aws commands a.k.a. "AWS_PROFILE"`
          }) parseProfile(val: string): string {
    return val;
  }

  async callBase(options: any, type: string, pkg: Package) {
    let config: any = CenvFiles.GetConfig();
    if (!config) {
      if (options.pkgCount === 1) {
        CenvLog.single.errorLog(`the package ${pkg.packageName} does not have a valid .cenv config`, pkg.packageName);
      }
      return;
    }
    let format = 'simple';
    if (options?.detail) {
      format = 'detail';
    }

    if (options?.pkgCount > 1) {
      format += '-pkg';
    }

    if (options?.deployed) {
      config = {...config, AllValues: true};
    }

    await getParams(config, type, format, options?.decrypted, options?.deployed);
  }

  async runCommand(params: string[], options: ParamsCommandOptions, packages?: Package[]): Promise<void> {
    try {
      if (params.length) {
        // force lowercase
        params = params.map(p => p.toLowerCase())

        // eliminate dupes
        const commandSet = new Set(params);

        // sort command order
        params = Array.from(commandSet)
        const commandOrder = Object.values(ParamCommands);
        params = params.sort((a: string, b: string) => {
          return commandOrder.indexOf(Object.values(ParamCommands)[Object.keys(ParamCommands).indexOf(a)]) - commandOrder.indexOf(Object.values(ParamCommands)[Object.keys(ParamCommands).indexOf(b)])
        });

        if (params.length > 3) {
          CenvLog.single.errorLog(`The cenv params command does not accept more than one additional argument. The following additional arguments were supplied in error: ${params.join(', ')}`)
          process.exit(4);
        }

        if (packages) {
          for (let i = 0; i < params.length; i++) {
            const param = params[i];
            options.defaults = true;
            for (const p of packages) {
              if (p.params && p.chDir() ) {
                if (param === ParamCommands.init) {
                  await Cenv.initParams(options, []);
                } else if (param === ParamCommands.fix) {
                  await p.checkStatus();
                  if (p.params.status.needsFix?.length) {
                    console.log('package', p.packageName);
                    await p.params.fixDupes();
                  }
                } else if (param === ParamCommands.deploy) {
                  await CenvParams.push(false);
                } else if (param === ParamCommands.pull) {
                  const depRes = await getConfig(p.params.name);
                  if (depRes) {
                    await CenvParams.pull(true, false, true, false, false, false, depRes.config, true);
                  }
                } else if (param === ParamCommands.materialize) {
                  await CenvParams.Materialize(options.test);
                }
              }
            }
          }
        }
      } else {

        let type: string | false = validateCount(Object.keys(options), [...variableTypes, 'all'], true);

        if (!type) {
          type = 'all';
        }
        if (packages) {
          const opts = {...options, pkgCount: packages.length};
          for (let i = 0; i < packages.length; i++) {
            if (packages[i].chDir()) {
              await this.callBase(opts, type, packages[i]);
            }
          }
        }
      }

    } catch (e) {
      CenvLog.single.errorLog(e as string);
    }
  }
}
