import { Command, CommandRunner, Option } from 'nest-commander';
import {
  BaseCommandOptions,
  CenvLog, Package,
  showPkgCmdsResult,
} from '@stoked-cenv/cenv-lib';

import {
  parseParamsExec,
  Cenv,
} from '@stoked-cenv/cenv-ui';

import { BaseCommand } from './base'

interface AddParamCommandOptions extends BaseCommandOptions {
  app?: boolean;
  environment?: boolean;
  global?: boolean;
  globalEnv?: boolean;
  encrypted?: boolean;
  deploy?: boolean;
}

@Command({
  name: 'add',
  description: 'Add parameter(s) to package',
  arguments: '<key> [value]',
  aliases: ['update', 'upsert']
})
export default class AddCommand extends BaseCommand {

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
    description: 'Adds an app parameter. App parameters are the same across all environments and are not used in other applications.',
  })
  parseConfig(val: boolean): boolean {
    return val;
  }

  @Option({
    name: 'environment',
    flags: '-e, --environment',
    description: 'Adds an environment parameter. Environment parameters are unique to each environment and are not used in other applications.',
  })
  parseEnvironment(val: boolean): boolean {
    return val;
  }

  @Option({
    name: 'global',
    flags: '-g, --global',
    description: 'Adds a global parameter. Global parameters are available to all applications in all environments.',
  })
  parseGlobal(val: boolean): boolean {
    return val;
  }

  @Option({
    name: 'globalEnv',
    flags: '-ge, --global-env',
    description: 'Adds a global environment parameter. Global environment parameters are available to all applications in a single environment.',
  })
  parseGlobalEnv(val: boolean): boolean {
    return val;
  }

  @Option({
    name: 'encrypted',
    flags: '-enc, --encrypted',
    description: 'Encrypts the value in the data store.',
  })
  parseEncrypted(val: boolean): boolean {
    return val;
  }

  @Option({
    name: 'deploy',
    flags: '-d, --deploy',
    description: 'Deploys the configuration after the parameter is added.',
  })
  parseDeploy(val: boolean): boolean {
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

  async runCommand(params: string[], options?: AddParamCommandOptions, packages?: Package[]): Promise<void> {
    try {
      await Promise.all(packages.map(async (p: Package) => {
        await Cenv.addParam(p, params, options);
      }));
    } catch (e) {
      CenvLog.single.errorLog(e.stack);
      process.exit(6);
      return
    }
  }
}
