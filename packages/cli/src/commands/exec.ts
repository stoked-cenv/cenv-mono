import {Command, Option} from 'nest-commander';
import path from 'path';
import {
  configure as cenvConfigure,
  errorInfo,
  packagePath,
  spawnCmd,
  startCenv,
  ClientMode,
  BaseCommandOptions,
  Package
} from '@stoked-cenv/cenv-lib';
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

  async runCommand(params: string[], options: any, packages: Package[]): Promise<void> {

    try {
      await cenvConfigure(options);
      let vars = {};
      await Promise.all(packages.map(async (p: Package) => {
        const pkgPath = packagePath(p.packageName);
        const relative = path.relative(process.cwd(), pkgPath);
        if (relative !== '') {
          process.chdir(path.relative(process.cwd(), pkgPath));
        }
        vars = await startCenv(ClientMode.REMOTE_ON_STARTUP);
        await spawnCmd('./', params.join(' '), params.join(' '), { envVars: vars }, p);
      }));
    } catch (e) {
      console.log(errorInfo(e));
    }
  }
}
