import { Command, Option } from 'nest-commander';
import {
  CenvFiles, CenvLog, Config, ConfigCommandOptions, exitNoMatchingProfiles, getProfiles, Package, printProfileQuery,
} from '@stoked-cenv/lib';
import { BaseCommand } from './base.command';
import { copyFileSync, existsSync } from 'fs';
import { join } from 'path';
import { RemoveConfigCommand } from './config.rm.command';
import { ListConfigCommand } from './config.ls.command';

@Command({
           name: 'config',
           description: 'Configure the cli for a specific aws profile and environment combination.',
           aliases: ['conf'],
           subCommands: [RemoveConfigCommand, ListConfigCommand],
         })
export class ConfigCommand extends BaseCommand {

  constructor() {
    super();
    this.config.allowUI = false;
    this.config.allowPackages = false;
    this.config.configRequired = false;
    this.config.cenvRootRequired = true;
  }

  @Option({
            flags: '-s, --show', description: 'Show the configuration for a specific profile',
          }) parseShow(val: boolean): boolean {
    return val;
  }

  async runCommand(params: string[], options?: ConfigCommandOptions, packages?: Package[]): Promise<void> {
    try {
      await Config(this.options, true);
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }
}
