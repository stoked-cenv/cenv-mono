import { Command, Option } from 'nest-commander';
import { CenvLog, updateLambdas, BaseCommandOptions } from '@stoked-cenv/lib';
import { BaseCommand } from './base'

interface LambdaCommandOptions extends BaseCommandOptions{
  testing?: string;
}

@Command({
  name: 'lambda',
  description: 'Update lambda cenv params'
})

export default class LambdaCommand extends BaseCommand {
  @Option({
    flags: '-ll, --log-level, <logLevel>',
    description: `Logging mode`,
  })
  parseLogLevel(val: string): string {
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

  async runCommand(params: string[], options?: LambdaCommandOptions): Promise<void> {
    try {
      if (params.length !== 3) {
        CenvLog.single.errorLog('lambda requires 3 arguments <function> <envVar> <envVal>');
        return;
      }
      await updateLambdas({ [params[1]]: params[2] }, params[0])
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }
}
