import { Option, SubCommand } from 'nest-commander';
import { CenvLog, InitCommandOptions, Package, Init } from '@stoked-cenv/lib';

import { BaseCommand } from './base.command';

@SubCommand({
              name: 'init', description: `Initialize cenv in an existing monorepo`,
            })
export class InitCommand extends BaseCommand {
  constructor() {
    super();
    this.config.allowUI = false;
  }

  @Option({
            flags: '-ll, --log-level, <logLevel>', description: `Logging mode`,
          }) parseLogLevel(val: string): string {
    return val;
  }

  @Option({
            flags: '-s, --scope <scope>', description: `Assign a scope to be used throughout the workspace`,
          }) parseScope(val: string): string {
    return val;
  }

  async runCommand(passedParam: string[], options: InitCommandOptions, packages: Package[]): Promise<void> {
    try {
      await Init(options, this.config);
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }
}
