import { Command, CommandRunner, Option } from 'nest-commander';
import { CenvLog, execAll, spawnCmd, configDefaults, CenvFiles, CleanCommandOptions } from '@stoked-cenv/cenv-lib';
import { BaseCommand } from './base'

@Command({
  name: 'clean',
  description: `Clean currently configured local files related to data in the ${configDefaults.appExt} configuration`,
})
export default class CleanCommand extends BaseCommand {
  @Option({
    flags: '-ll, --log-level, <logLevel>',
    description: `Logging mode`,
  })
  parseLogLevel(val: string): string {
    return val;
  }

  @Option({
    name: 'mode',
    flags: '-m, --mode [mode]',
    description: 'either cenv, cdk, or both',
    defaultValue: 'cenv'
  })
  parseMode(val: string, val2): string {
    return val;
  }

  @Option({
    name: 'environment',
    flags: '-e, --environment <environment>',
    description: 'clean specific environment only',
    defaultValue: undefined
  })
  parseEnvironment(val: string, val2): string {
    return val;
  }

  @Option({
    name: 'globals',
    flags: '-g, --globals',
    description: 'Cleans global files',
  })
  parseGlobals(val: boolean): boolean {
    return val;
  }
  @Option({
    name: 'all applications',
    flags: '-aa, --all-applications',
    description: 'Cleans every directory in lerna.',
  })
  parseEncrypted(val: boolean): boolean {
    return val;
  }

  async runCommand(param: string[], options: CleanCommandOptions) {
    try {

      const modes = ['cenv', 'cdk', 'both'];
      if (!modes.includes(options?.mode)) {
        CenvLog.single.errorLog(`The mode '${options?.mode} is not valid.`)
        process.exit();
      }

      if (options?.mode === 'cdk' || options?.mode === 'both') {
        if (options?.allApplications) {
          await spawnCmd('./', 'lerna exec --scope @*/*deploy -- rm -rf cdk.context.json cdk.out', 'cdk clear');
        } else {
          await spawnCmd('./', 'rm -rf cdk.context.json cdk.out', 'cdk clear');
        }
      }

      if (options?.mode === 'cenv' || options?.mode === 'both') {
        if (options?.allApplications) {
          await execAll(`cenv clean -m ${options?.mode}`);

        } else {
          CenvFiles.Clean(undefined, options);
        }
      }
    } catch (e) {
      CenvLog.single.catchLog(e)
    }
  }
}
