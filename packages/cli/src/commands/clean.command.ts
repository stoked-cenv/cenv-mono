import {Command, Option} from 'nest-commander';
import {CenvFiles, CenvLog, configDefaults, Package, spawnCmd} from '@stoked-cenv/lib';
import {BaseCommand} from './base.command'

@Command({
           name: 'clean',
           description: `Clean currently configured local files related to data in the ${configDefaults.appExt} configuration`,
         })
export class CleanCommand extends BaseCommand {
  @Option({
            flags: '-ll, --log-level, <logLevel>', description: `Logging mode`,
          }) parseLogLevel(val: string): string {
    return val;
  }

  @Option({
            name: 'mode', flags: '-m, --mode [mode]', description: 'either cenv, cdk, or both', defaultValue: 'cenv'
          }) parseMode(val: string): string {
    return val;
  }

  @Option({
            name: 'environment',
            flags: '-e, --environment <environment>',
            description: 'clean specific environment only'
          }) parseEnvironment(val: string): string {
    return val;
  }

  @Option({
            name: 'globals', flags: '-g, --globals', description: 'Cleans global files',
          }) parseGlobals(val: boolean): boolean {
    return val;
  }

  async runCommand(params: string[], options: any, packages: Package[]) {
    try {

      const modes = ['cenv', 'cdk', 'both'];
      if (!modes.includes(options?.mode)) {
        CenvLog.single.errorLog(`The mode '${options?.mode} is not valid.`)
        process.exit();
      }

      await Promise.all(packages.map(async (p: Package) => {
        if ((options?.mode === 'cdk' || options?.mode === 'both') && p.stack) {
          await spawnCmd('./', 'rm -rf cdk.context.json cdk.out', 'cdk clear', {}, p);
        }

        if ((options?.mode === 'cenv' || options?.mode === 'both') && p.params) {
          CenvFiles.Clean(undefined, options);
        }
      }));

    } catch (e) {
      CenvLog.single.catchLog(e)
    }
  }
}
