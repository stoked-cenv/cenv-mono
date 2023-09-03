import { Option, SubCommand } from 'nest-commander';
import { BaseCommandOptions, CenvLog, Deployment, Package, ParamsModule } from '@stoked-cenv/lib';

import { BaseCommand } from './base.command';

@SubCommand({
  name: 'destroy', description: 'Deploy stack', aliases: ['des', 'u'],
})
export class StackDestroyCommand extends BaseCommand {

  constructor() {
    super();

  }

  async runCommand(param: string[], options: BaseCommandOptions, packages?: Package[]): Promise<void> {
    try {

      packages?.map((p: Package) => {
        p.stack?.destroy();
      })

    } catch (e) {
      console.log(CenvLog.colors.error(e));
    }
  }
}
