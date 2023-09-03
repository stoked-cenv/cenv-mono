import {Command, Option} from 'nest-commander';
import {New, CenvLog, NewCommandOptions, Package} from '@stoked-cenv/lib'

import {BaseCommand} from './base.command';

@Command({
           name: 'new', description: `Create a new cenv project`, aliases: ['n'], arguments: '<name>',
         })
export class NewCommand extends BaseCommand {
  constructor() {
    super();
    this.config.allowLocalPackage = true;

    this.config.cenvRootRequired = false;
  }


  @Option({
            flags: '-ll, --log-level, <logLevel>', description: `Logging mode`,
          }) parseLogLevel(val: string): string {
    return val;
  }

  @Option({
            flags: '-t, --template <template>', description: `Specify a template to use for the new project`, defaultValue: 'web'
          }) parseScope(val: string): string {
    return val;
  }

  @Option({
            flags: '-f, --force', description: `Force overwrite if directory exists`
          }) parseForce(val: boolean): boolean {
    return val;
  }

  async runCommand(passedParam: string[], options: NewCommandOptions, packages: Package[]): Promise<void> {
    try {
      if (passedParam.length === 0) {
        CenvLog.single.catchLog('You must supply a name for your new project');
      }
      if (passedParam.length > 1) {
        CenvLog.single.catchLog('The new command only accepts a single argument for the new project name');
      }

      await New(passedParam[0], options, this.config);
    } catch (e) {
      CenvLog.single.catchLog(e)
    }
  }
}
