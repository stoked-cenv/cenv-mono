import { Option, SubCommand } from 'nest-commander';
import { BaseCommandOptions, CenvFiles, CenvLog, CenvParams, getEnvironment, Package, ParamsModule } from '@stoked-cenv/lib';

import { BaseCommand } from './base.command';

interface PullCommandOptions extends BaseCommandOptions {
  deployed?: boolean;
  environment?: string,
  decrypted?: boolean,
}

@SubCommand({
              name: 'pull', description: 'Pull the latest application configuration', arguments: '[options]',
            })
export class ParamsPullCommand extends BaseCommand {

  constructor() {
    super();
    this.config.allowUI = false;
  }
  @Option({
            flags: '-ll, --log-level, <logLevel>', description: `Logging mode`,
          }) parseLogLevel(val: string): string {
    return val;
  }

  @Option({
            name: 'deployed', flags: '-d, --deployed', description: 'Pull the most up to date variables that have been deployed.',
          }) parseDeployed(val: boolean): boolean {
    return val;
  }

  @Option({
            name: 'decrypted', flags: '-D, --decrypted', description: 'Decrypt the variables before pulling them.',
          }) parseDecrypted(val: boolean): boolean {
    return val;
  }

  @Option({
            name: 'environment',
            flags: '-e, --environment <string>',
            description: 'Supply a different environment than your current environment to update your local stack\'s config to use that environments app config variables.',
          }) parseEnvironment(val: string): string {
    return val;
  }

  async runCommand(passedParam: string[], options: PullCommandOptions, packages: Package[]): Promise<void> {
    try {

      await Promise.allSettled(packages.map(async (p: Package) => {
        if (p.params) {
          const config = await ParamsModule.GetConfig(p.packageName);
          if (!config) {
            CenvLog.single.errorLog('pull: could not load config');
            process.exit(7);
          }

          await p.params.pull(options?.deployed, options?.decrypted);
        }
      }));
    } catch (e) {
      console.log(CenvLog.colors.error(e));
    }
  }
}
