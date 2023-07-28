import {Command, Option} from 'nest-commander';
import {Cenv, CenvLog, InitCommandOptions, Package} from '@stoked-cenv/lib'

import {BaseCommand} from './base.command';


@Command({
           name: 'init', description: `Initialize cenv in an existing monorepo`,
         })
export class InitCommand extends BaseCommand {
  allowUI = false;
  localPackageAccepted = true;
  @Option({
            flags: '-ll, --log-level, <logLevel>', description: `Logging mode`,
          }) parseLogLevel(val: string): string {
    return val;
  }

  @Option({
            flags: '-s, --scope <scope>', description: `Assign a scope to be used throughout the workspace`,
          }) parseScope(val: string): string {
    return val;
  }

  async runCommand(passedParam: string[], options: InitCommandOptions, packages: Package[]): Promise<void> {
    try {
      await Cenv.init(options);
    } catch (e) {
      CenvLog.single.catchLog(e)
    }
  }
}
