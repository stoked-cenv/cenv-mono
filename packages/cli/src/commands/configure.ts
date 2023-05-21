import { Command, CommandRunner, Option } from 'nest-commander';
import {

} from '@stoked-cenv/cenv-lib';
import { CenvLog, infoBold, configure as cenvConfigure, ConfigureCommandOptions } from '@stoked-cenv/cenv-lib';
import { BaseCommand } from './base'

import { copyFileSync, existsSync,  } from 'fs';
import { join } from 'path';

@Command({
  name: 'configure',
  description: 'Configure the cli for a specific deployment.',
  aliases: ['config', 'conf']
})
export default class ConfigureCommand extends BaseCommand {
  @Option({
    flags: '-ll, --log-level, <logLevel>',
    description: `Logging mode`,
  })
  parseLogLevel(val: string): string {
    return val;
  }

  @Option({
    flags: '-k, --key',
    description: 'Use a custom key',
  })
  parseKey(val: boolean): boolean {
    return val;
  }

  @Option({
    flags: '--profile <string>',
    description: 'Cenv configuration profile',
  })
  parseEnvironment(val: string): string {
    return val;
  }

  @Option({
    flags: '-l, --localstack-api-key <string>',
    description: 'Set a local stack api key',
  })
  parseLocalstackKey(val: string): string {
    return val;
  }

  @Option({
    flags: '-s, --show',
    description: 'Show the configuration for a specific profile',
  })
  parseShow(val: boolean): boolean {
    return val;
  }

  set(params, options, isFirstPass) {
    if (params.length === 2) {
      if (params[0] !== 'set') {
        process.exit(6);
      }

      const configPath = join(process.env.HOME, `.cenv`);
      if (!existsSync(configPath) && (params[1] !== 'local' && isFirstPass)) {
        CenvLog.single.errorLog('.cenv has not been configured yet')
        process.exit(6);
      }
      if (isFirstPass && params[1] !== 'local' || !isFirstPass) {
        const profilePath = join(configPath, params[1]);
        if (!existsSync(profilePath)) {
          CenvLog.single.errorLog(`the profile ${infoBold(params[1])} that you are attempted to set as default doesn't exist`);
          process.exit(6);
        }
        CenvLog.single.infoLog(`default profile set to ${infoBold(params[1])}`);
        const defaultPath = join(configPath, 'default');
        copyFileSync(profilePath, defaultPath)
        options.show = true;
      } else {
        options.profile = 'local'
      }
    }
    return options;
  }
  async runCommand(
    passedParam: string[],
    options?: ConfigureCommandOptions,
  ): Promise<void> {
    try {

      options = this.set(passedParam, options, true);
      await cenvConfigure(options, true);
      if (passedParam.length === 2 && passedParam[1] === 'local') {
        this.set(passedParam, options, false);
        options.show = true;
        await cenvConfigure(options, false);
      }
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }
}
