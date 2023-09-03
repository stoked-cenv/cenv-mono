import { Option, SubCommand } from 'nest-commander';
import { BaseCommandOptions, CenvLog, CenvParams, Package } from '@stoked-cenv/lib';
import { BaseCommand } from './base.command';

interface AddParamCommandOptions extends BaseCommandOptions {
  app?: boolean;
  environment?: boolean;
  global?: boolean;
  globalEnv?: boolean;
  encrypted?: boolean;
  deploy?: boolean;
}

@SubCommand({
              name: 'add', description: 'Add parameter(s) to package', arguments: '<key> [value]', aliases: ['update', 'upsert'],
            })
export class ParamsAddCommand extends BaseCommand {

  constructor() {
    super();

  }

  @Option({
            name: 'app type',
            flags: '-A, --app-type',
            description: 'Adds an app parameter. App parameters are the same across all environments and are not used in other applications.',
          }) parseConfig(val: boolean): boolean {
    return val;
  }

  @Option({
            name: 'environment type',
            flags: '-E, --environment-type',
            description: 'Adds an environment parameter. Environment parameters are unique to each environment and are not used in other applications.',
          }) parseEnvironment(val: boolean): boolean {
    return val;
  }

  @Option({
            name: 'global type',
            flags: '-G, --global-type',
            description: 'Adds a global parameter. Global parameters are available to all applications in all environments.',
          }) parseGlobal(val: boolean): boolean {
    return val;
  }

  @Option({
            name: 'globalEnv type',
            flags: '-GE, --global-env-type',
            description: 'Adds a global environment parameter. Global environment parameters are available to all applications in a single environment.',
          }) parseGlobalEnv(val: boolean): boolean {
    return val;
  }

  @Option({
            name: 'encrypted', flags: '-enc, --encrypted', description: 'Encrypts the value in the data store.',
          }) parseEncrypted(val: boolean): boolean {
    return val;
  }

  async runCommand(params: string[], options?: AddParamCommandOptions, packages?: Package[]): Promise<void> {
    try {
      if (!packages) {
        CenvLog.single.mouth.err('could not determine which package to upsert this param to', 'add failed');
        process.exit(0);
      }
      await Promise.all(packages.map(async (p: Package) => {
        if (p.params) {
          await p.params.addParam(p, params, options as Record<string, string>);
        }
      }));
    } catch (e) {
      CenvLog.single.catchLog(e as string);
      process.exit(6);
      return;
    }
  }
}
