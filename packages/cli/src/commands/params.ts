import { Command, CommandRunner, Option } from 'nest-commander';
import {
  Cenv,
  validateCount, ParamsCommandOptions,
} from '@stoked-cenv/cenv-ui';
import {
  deleteFiles,
  errorInfo,
  CenvLog,
  getParams,
  Package,
  CenvParams,
  CenvFiles,
  variableTypes, getConfig
} from '@stoked-cenv/cenv-lib'

import { BaseCommand } from './base'


enum ParamCommands {
  init = 'init',
  deploy = 'deploy',
  pull = 'pull',
  fix = 'fix',
  materialize = 'materialize'
}

import path from 'path';

@Command({
  name: 'params',
  description: 'Init, deploy, and display package parameters',
})
export default class ParamsCommand extends BaseCommand {
  @Option({
    flags: '-ll, --log-level, <logLevel>',
    description: `Logging mode`,
  })
  parseLogLevel(val: string): string {
    return val;
  }

  @Option({
    name: 'app',
    flags: '-a, --app',
    description: 'Displays all app parameters. App parameters are the same across all environments and are not used in other applications.',
  })
  parseConfig(val: string): string {
    return val;
  }

  @Option({
    name: 'environment',
    flags: '-e, --environment',
    description: 'Displays environment parameters. Environment parameters are unique to each environment and are not used in other applications.',
  })
  parseEnvironment(val: string): string {
    return val;
  }

  @Option({
    name: 'global',
    flags: '-g, --global',
    description: 'Displays global parameters. Global parameters are available to all applications in all environments.',
  })
  parseGlobal(val: string): string {
    return val;
  }

  @Option({
    name: 'all',
    flags: '-a, --all',
    description: 'Print all the variable types config, environment, and config.',
  })
  parseAll(val: string): string {
    return val;
  }

  @Option({
    name: 'detail',
    flags: '-d, --detail',
    description: 'Print all the variable meta data including path, value, and type.',
  })
  parseDetail(val: boolean): boolean {
    return val;
  }

  @Option({
    name: 'simple',
    flags: '-s, --simple',
    description: 'Print only environment variable and value.',
    defaultValue: true
  })
  parseSimple(val: boolean): boolean {
    return val;
  }

  @Option({
    name: 'decrypted',
    flags: '-de, --decrypted',
    description: 'Display decrypted values on SecureString types.',
  })
  parseEncrypted(val: boolean): boolean {
    return val;
  }

  @Option({
    name: 'deployed',
    flags: '-D, --deployed',
    description: 'Print variable data that has been deployed.',
  })
  parseDeployed(val: boolean): boolean {
    return val;
  }

  @Option({
    flags: '--profile, <profile>',
    description: `Environment profile to use on init.`,
    defaultValue: 'default',
  })
  parseProfile(val: string): string {
    return val;
  }

  @Option({
    name: 'all applications',
    flags: '-aa, --all-applications',
    description: 'Get the variables from all applications.',
  })
  parseAllApplications(val: boolean): boolean {
    return val;
  }

  @Option({
    name: 'output',
    flags: '-o, --output [output]',
    description: 'Print all the variable meta data including path, value, and type.',
  })
  parseOutput(val: string): string {
    return val;
  }

  @Option({
    name: 'include application',
    flags: '-ia, --include-application',
    description: 'Include application in response. Internally used by the -aa flag to track which variables belong to which app.',
  })
  parseIncludeApp(val: boolean): boolean {
    return val;
  }

  @Option({
    name: 'test',
    flags: '-t, --test',
    description: 'Test mode for params.',
  })
  parseTest(val: boolean): boolean {
    return val;
  }

  tags: string[] = [];
  @Option({
    flags: '--tag <string> [args...]',
    description: `Only run in projects with the given tag`,
  })
  parseTag(val: string): string {
    this.tags.push(val);
    return val;
  }

  async callBase(options, type) {
    const config = CenvFiles.GetConfig();
    if (!config ) {
      CenvLog.single.errorLog('could not load config');
      return;
    }
    if (options?.detail) {
      options.simple = false;
    }

    const params = await getParams(options?.deployed ? {...config, AllValues: true } : config, type, options?.simple ? 'simple' : 'detail', options?.decrypted, options?.deployed);
  }

  async runCommand(params: string[], options?: ParamsCommandOptions, packages?: Package[]): Promise<void> {
    try {
      if (params.length) {
        // force lowercase
        params = params.map(p => p.toLowerCase())

        // eliminate dupes
        const commandSet = new Set(params);

        // sort command order
        params = Array.from(commandSet)
        const commandOrder = Object.values(ParamCommands);
        params = params.sort((a, b) => commandOrder.indexOf(ParamCommands[a]) - commandOrder.indexOf(ParamCommands[b]))

        if (params.length > 3) {
          CenvLog.single.errorLog(`The cenv params command does not accept more than one additional argument. The following additional arguments were supplied in error: ${params.join(', ')}`)
          process.exit(4);
        }

        for (let i = 0; i < params.length; i++) {
          const param = params[i];
          options.defaults = true;
          for (const p of packages) {
            if (p.chDir()) {
              if (param === ParamCommands.init) {
                await Cenv.init(options, this.tags);
              } else if (param === ParamCommands.fix) {

                await p.checkStatus();
                if (p?.params?.status.needsFix?.length) {
                  console.log('package', p.packageName);
                  await p.params.fixDupes();
                }
              } else if (param === ParamCommands.deploy) {
                //await p.checkStatus();
                //if (p.params.duplicates.length) {
                //  await p.params.fixDupes();
                //}
                await CenvParams.push(false);
              } else if (param === ParamCommands.pull) {
                const depRes = await getConfig(p.params.name);
                if (depRes) {

                  await CenvParams.pull(true,
                    false,
                    true,
                    false,
                    false,
                    false,
                    depRes.config,
                    true);
                }

                //await p.checkStatus();
                //if (p.params.duplicates.length) {
                //  await p.params.fixDupes();
                //}
              } else if (param === ParamCommands.materialize) {
                await CenvParams.Materialize();
              }
            }
          }
        }
        process.exit(0)
      } else if (options?.test) {
        process.env.CENV_PARAMS_EXTRACTION_TEST='true'
        if (process.env.CENV_REGENERATE_FROM_TEMPLATES) {
          const env = process.env.ENV;
          const reg = new RegExp(`^\.cenv\.${process.env.ENV}\-[0-9]{12}(\.globals)?$`, '')
          await deleteFiles(reg, { regex: true, excludedDirs: ['node_modules', 'cdk.out'], includedDirs:['.cenv']})
        }

        await Promise.all(packages.map(async (p: Package) => {
          const relativePath = path.relative(process.cwd(), p.params.path);
          if (relativePath !== '') {
            process.chdir(relativePath);
          }
          await CenvParams.pull(false, false, false, true, false, false);
        }));

        process.exit(0);
      }
      let type = validateCount(Object.keys(options), [...variableTypes, 'all'], true);
      if (!type)
        type = 'all';
      if (packages?.length) {
        for (let i = 0; i < packages.length; i++) {
          if (packages[i].chDir()) {
            await this.callBase(options, type);
          }
        }
        return;
      }
      await this.callBase(options, type);
    } catch (e) {
      console.log(errorInfo(e) + '\n' + e.stack );
    }
  }
}
