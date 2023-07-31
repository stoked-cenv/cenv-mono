import { CommandRunner, Option, SubCommand } from 'nest-commander';
import { CenvLog, ConfigCommandOptions, Package } from '@stoked-cenv/lib';
import { BaseCommand } from './base.command';

interface ListConfigCommandOptions extends ConfigCommandOptions {
  env?: string
}


@SubCommand({
  name: 'list',
  description: 'List configuration profiles',
  aliases: ['ls']
})
export class ListConfigCommand extends BaseCommand {

  async runCommand(params: string[], options?: ListConfigCommandOptions, packages?: Package[]): Promise<void> {
    const test = 10;
  }
}
