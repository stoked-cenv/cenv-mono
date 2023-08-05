import {Command, Option} from 'nest-commander';
import * as path from 'path';
import {
  BaseCommandOptions,
  CenvFiles,
  CenvLog,
  getConfigVars,
  Package,
  PackageModule,
  spawnCmd,
} from '@stoked-cenv/lib';
import {BaseCommand} from './base.command'


interface ExecCommandOptions extends BaseCommandOptions {
  module?: string;
  doubleDash?: string;
}

@Command({
           name: 'exec', description: 'Execute command using cenv context',
         })
export class ExecCommand extends BaseCommand {
  @Option({
            flags: '-ll, --log-level, <logLevel>', description: `Logging mode`,
          }) parseLogLevel(val: string): string {
    return val;
  }

  @Option({
            flags: '--profile <string>', description: `Profile to use for aws commands a.k.a. "AWS_PROFILE"`
          }) parseEnvironment(val: string): string {
    return val;
  }

  @Option({
            flags: '-m, --module [application]', description: 'Provide the module directory to run the command from',
          }) parseModule(val: string): string {
    return val;
  }

  @Option({
            name: 'double-dash', flags: '--', description: 'Cenv application to run the command on',
          }) parseSubCommand(val: string, val2: string): string {
    return val;
  }

  async runCommand(params: string[], options: any, packages: Package[]): Promise<void> {
    try {
      let vars = {};
      await Promise.all(packages.map(async (p: Package) => {
        const pkgPath = CenvFiles.packagePath(p.packageName);
        if (pkgPath) {
          const relative = path.relative(process.cwd(), pkgPath);
          if (relative !== '') {
            process.chdir(path.relative(process.cwd(), pkgPath));
          }
          const config = CenvFiles.GetConfig();
          if (config) {
            vars = await getConfigVars(true, false, 'ENVIRONMENT VARIABLES', true);
            Object.entries(options.args).forEach(([key, value]) => {
              console.log(`export ${CenvLog.colors.stdHighlight(key)}=${CenvLog.colors.stdHighlight(value)}`)
            });
          }
          options.module = options.module?.toLowerCase();
          if (options.module) {
            const pkgModule: PackageModule = p.packageModules[options.module]
            const modulePath = path.relative(process.cwd(), pkgModule.path);
            if (modulePath !== process.cwd()) {
              process.chdir(path.relative(process.cwd(), pkgModule.path));
            }
          }
        }
        await spawnCmd('./', params.join(' '), params.join(' '), {envVars: vars}, p);
      }));
    } catch (e) {
      console.log(CenvLog.colors.error(e));
    }
  }
}
