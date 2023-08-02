import { Option, SubCommand } from 'nest-commander';
import { CenvLog, ConfigCommandOptions, Package, RemoveConfig } from '@stoked-cenv/lib';
import { BaseCommand } from './base.command';

@SubCommand({
              name: 'remove', description: 'Delete a configuration profile.', aliases: ['rm'],
            })
export class RemoveConfigCommand extends BaseCommand {

  constructor() {
    super();
    this.config.allowUI = false;
    this.config.allowPackages = false;
    this.config.configRequired = false;
    this.config.cenvRootRequired = true;
  }

  @Option({
            flags: '-d, --default', description: 'Remove the default cenv profile',
          }) parseShow(val: boolean): boolean {
    return val;
  }

  async runCommand(params: string[], options?: ConfigCommandOptions, packages?: Package[]): Promise<void> {
    try {
      await RemoveConfig(options);
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }
}
