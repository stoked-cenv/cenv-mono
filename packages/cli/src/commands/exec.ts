import {Command, Option} from 'nest-commander';
import path from 'path';
import { configure as cenvConfigure, errorInfo, packagePath, spawnCmd, startCenv, ClientMode, BaseCommandOptions } from '@stoked-cenv/cenv-lib';
import { BaseCommand } from './base'


interface ExecCommandOptions extends BaseCommandOptions {
  application?: string;
  doubleDash?: string;
}

@Command({
  name: 'exec',
  description: 'Execute command using cenv context',
})
export default class ExecCommand extends BaseCommand {
  @Option({
    flags: '-ll, --log-level, <logLevel>',
    description: `Logging mode`,
  })
  parseLogLevel(val: string): string {
    return val;
  }
  @Option({
    flags: '--profile <string>',
    description: 'Cenv configuration profile',
    defaultValue: 'default',
  })
  parseEnvironment(val: string): string {
    return val;
  }

  @Option({
    flags: '-a, --application [application]',
    description: 'Cenv application to run the command on',
  })
  parseApplication(val: string): string {
    return val;
  }

  @Option({
    name: 'double-dash',
    flags: '--',
    description: 'Cenv application to run the command on',
  })
  parseSubCommand(val: string, val2: string): string {
    return val;
  }

  async runCommand(
    passedParam: string[],
    options?: ExecCommandOptions,
  ): Promise<void> {

    try {
      await cenvConfigure(options);
      let vars = {};
      if (options?.application) {
        const pkgPath = packagePath(options?.application);
        const relative = path.relative(process.cwd(), pkgPath);
        if (relative !== '') {
          process.chdir(path.relative(process.cwd(), pkgPath));
        }
        vars = await startCenv(ClientMode.REMOTE_ON_STARTUP);
      }
      await spawnCmd('./', passedParam.join(' '), passedParam.join(' '), { envVars: vars });
    } catch (e) {
      console.log(errorInfo(e));
    }
  }
}
