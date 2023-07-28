import {Command, Option} from 'nest-commander';
import {BaseCommandOptions, CenvLog, updateLambdas} from '@stoked-cenv/lib';
import {BaseCommand} from './base.command'

interface LambdaCommandOptions extends BaseCommandOptions {
  testing?: string;
}

@Command({
           name: 'lambda', description: 'Update lambda cenv params'
         })

export default class LambdaCommand extends BaseCommand {
  @Option({
            flags: '-ll, --log-level, <logLevel>', description: `Logging mode`,
          }) parseLogLevel(val: string): string {
    return val;
  }

  @Option({
            flags: '--profile, <profile>', description: `Profile to use for aws commands a.k.a. "AWS_PROFILE"`
          }) parseProfile(val: string): string {
    return val;
  }

  async runCommand(params: string[], options?: LambdaCommandOptions): Promise<void> {
    try {
      if (params.length !== 3) {
        CenvLog.single.errorLog('lambda requires 3 arguments <function> <envVar> <envVal>');
        return;
      }
      await updateLambdas({[params[1]]: params[2]}, params[0])
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }
}
