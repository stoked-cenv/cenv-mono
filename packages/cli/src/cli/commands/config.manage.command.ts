import { SubCommand } from 'nest-commander';
import { ConfigCommandOptions, Config, Package, CenvFiles, Cenv } from '@stoked-cenv/lib';
import { BaseCommand } from './base.command';

@SubCommand({
              name: 'manage', description: 'Manage configuration profiles', aliases: ['m'],
            })
export class ManageConfigCommand extends BaseCommand {

  constructor() {
    super();
    this.config.allowUI = false;
    this.config.configRequired = false;
    this.config.allowPackages = false;
    this.config.cenvRootRequired = false;
  }

  async runCommand(params: string[], options?: ConfigCommandOptions, packages?: Package[]): Promise<void> {
    CenvFiles.setPaths();
    Cenv.config = new Config();
    await Cenv.config.manage();
  }
}
