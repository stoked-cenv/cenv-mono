import { Option, SubCommand } from 'nest-commander';
import { BaseCommandOptions, CenvLog, getConfig, Package } from '@stoked-cenv/lib';
import { rmSync } from 'fs';
import { BaseCommand } from './base.command';

@SubCommand({
  name: 'deploy', description: 'Deploy stack', aliases: ['dep', 'i'],
})
export class StackDeployCommand extends BaseCommand {
  constructor() {
    super();
    this.config.allowUI = false;
  }

  async runCommand(param: string[], options: BaseCommandOptions, packages?: Package[]): Promise<void> {
    try {

      packages?.map(async (p: Package) => {
        if (p.stack) {
          await p.stack.deploy({ stack: true }, options);
        }
      });

    } catch (e) {
      console.log(CenvLog.colors.error(e));
    }
  }
}
