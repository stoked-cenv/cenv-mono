import { CommandRunner, Option, SubCommand } from 'nest-commander';
import {
  CenvLog, Cenv, ConfigRemoveCommandOptions, CommandInfo, Package, ConfigCommandOptions,
} from '@stoked-cenv/lib';
import { Config } from '@jest/types';
import { BaseCommand } from './base.command';

@SubCommand({
   name: 'remove',
   description: 'Delete a configuration profile.',
   aliases: ['rm']
})
export class RemoveConfigCommand extends BaseCommand {
  config?: CommandInfo;

  @Option({
            flags: '-d, --default',
            description: 'Remove the default cenv profile',
          })
  parseShow(val: boolean): boolean {
    return val;
  }

  async runCommand(params: string[], options?: ConfigCommandOptions, packages?: Package[]): Promise<void> {

    try {
      console.log('rm', params, options, this.command?.optsWithGlobals());
      await Cenv.removeConfig(options);
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }

}
