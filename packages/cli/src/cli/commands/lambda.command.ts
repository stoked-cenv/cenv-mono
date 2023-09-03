import {Command, Option} from 'nest-commander';
import {BaseCommandOptions, CenvLog, updateLambdas} from '@stoked-cenv/lib';
import {BaseCommand} from './base.command'

interface LambdaCommandOptions extends BaseCommandOptions {
  testing?: string;
}

@Command({
           name: 'lambda', description: 'Update lambda cenv params'
         })

export class LambdaCommand extends BaseCommand {
  constructor() {
    super();

  }

  @Option({
            flags: '-ll, --log-level, <logLevel>', description: `Logging mode`,
          }) parseLogLevel(val: string): string {
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
