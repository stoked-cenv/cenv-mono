import { SubCommand } from 'nest-commander';
import { ConfigCommandOptions, ListConfigs, Package } from '@stoked-cenv/lib';
import { BaseCommand } from './base.command';

interface ListConfigCommandOptions extends ConfigCommandOptions {
  env?: string;
}

@SubCommand({
              name: 'list', description: 'List configuration profiles', aliases: ['ls'],
            })
export class ListConfigCommand extends BaseCommand {

  constructor() {
    super();
    this.config.allowUI = false;
    this.config.configRequired = false;
    this.config.allowPackages = false;
    this.config.cenvRootRequired = false;
  }

  async runCommand(params: string[], options?: ListConfigCommandOptions, packages?: Package[]): Promise<void> {
    await ListConfigs(options);
  }
}
