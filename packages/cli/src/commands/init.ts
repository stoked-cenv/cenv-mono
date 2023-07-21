import {Command, Option} from 'nest-commander';
import {Cenv, CenvLog, InitCommandOptions, Package} from '@stoked-cenv/lib'

import {BaseCommand} from './base';


@Command({
           name: 'init', description: `Initialize cenv in an existing monorepo`,
         })
export default class InitCommand extends BaseCommand {

  constructor() {
    super()
    this.allowUI = false;
    this.localPackageAccepted = true;
  }


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
