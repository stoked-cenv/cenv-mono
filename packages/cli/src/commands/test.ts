import { Command, CommandRunner, Option } from 'nest-commander';
import { CenvLog, showPkgCmdsResult, BaseCommandOptions, parseParamsExec, Package } from '@stoked-cenv/cenv-lib';
import { Test } from '@stoked-cenv/cenv-ui';
import { BaseCommand } from './base'


@Command({
  name: 'test',
  description: 'Build and push docker containers to ecr'
})
export default class TestCommand extends BaseCommand {
  @Option({
    flags: '-ll, --log-level, <logLevel>',
    description: `Logging mode`,
  })
  parseLogLevel(val: string): string {
    return val;
  }

  async runCommand(params: string[], options?: BaseCommandOptions, packages?: Package[]): Promise<void> {
    try {
      const pkgCmds = await parseParamsExec(params, options, Test.exec);
      await showPkgCmdsResult(pkgCmds);
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }
}
