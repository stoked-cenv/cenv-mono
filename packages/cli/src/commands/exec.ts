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
  Package, CenvFiles
} from '@stoked-cenv/cenv-lib';
import { BaseCommand } from './base'


interface ExecCommandOptions extends BaseCommandOptions {
  module?: string;
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
    flags: '-m, --module [application]',
    description: 'Provide the module directory to run the command from',
  })
  parseModule(val: string): string {
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
        const config = CenvFiles.GetConfig();
        if (config) {
          vars = await startCenv(ClientMode.REMOTE_ON_STARTUP);
        }
        options.module = options.module?.toLowerCase();
        if (options.module && p[options.module]) {
          const modulePath = path.relative(process.cwd(), p[options.module].path);
          if (modulePath !== process.cwd()) {
            process.chdir(path.relative(process.cwd(), p[options.module].path));
          }
        }
        await spawnCmd('./', params.join(' '), params.join(' '), { envVars: vars }, p);
      }));
    } catch (e) {
      console.log(errorInfo(e));
    }
  }
}
