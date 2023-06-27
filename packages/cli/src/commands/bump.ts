import { Command, CommandRunner, Option } from 'nest-commander';
import { CenvLog, Package, BaseCommandOptions, Version } from '@stoked-cenv/cenv-lib'
import { BaseCommand } from './base'

@Command({
  name: 'bump',
  description: `Bump packages`,
})
export default class BumpCommand extends BaseCommand {
  @Option({
    flags: '-ll, --log-level, <logLevel>',
    description: `Logging mode`,
  })
  parseLogLevel(val: string): string {
    return val;
  }

  async runCommand(params: string[], options: BaseCommandOptions, packages: Package[]) {
    try {
      if (params?.length === 1 && ['major', 'minor', 'patch', 'prerelease', 'reset'].indexOf(params[0]) > -1) {
        console.log(packages[0].isRoot);
        if (params[0] !== 'reset') {
          await Promise.all(packages.map(async (p: Package) => await p.build()));
        }
        await Version.Bump(packages, params[0]);
      } else {
        CenvLog.single.alertLog('the only param supported for bump is major, minor, patch, prerelease, or reset.')
      }
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }
}
