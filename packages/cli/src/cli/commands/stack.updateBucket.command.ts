import { Option, SubCommand } from 'nest-commander';
import { BaseCommandOptions, CenvLog, getConfig, Package } from '@stoked-cenv/lib';
import { rmSync } from 'fs';
import { BaseCommand } from './base.command';

@SubCommand({
  name: 'update-bucket', description: 'Update stack bucket', aliases: ['update'],
})
export class StackUpdateBucketCommand extends BaseCommand {
  constructor() {
    super();

  }

  async runCommand(param: string[], options: BaseCommandOptions, packages?: Package[]): Promise<void> {
    try {

      packages?.map(async (p: Package) => {
        if (p.stack) {
          await p.stack.updateBucket();
        }
      });

    } catch (e) {
      console.log(CenvLog.colors.error(e));
    }
  }
}
