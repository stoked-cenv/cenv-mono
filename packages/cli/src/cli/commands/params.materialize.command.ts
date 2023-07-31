import { Command, Option, SubCommand } from 'nest-commander';
import {Cenv, CenvLog, InitCommandOptions, Package} from '@stoked-cenv/lib'

import {BaseCommand} from './base.command';


@SubCommand({
  name: 'materialize',
  description: `Materialize cenv parameters from parameter store to app config`,
  aliases: ['m', 'mat']
})
export class ParamsMaterializeCommand extends BaseCommand {
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
