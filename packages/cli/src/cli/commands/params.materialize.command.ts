import { Option, SubCommand } from 'nest-commander';
import { CenvLog, Init, InitCommandOptions, Package, CenvParams } from '@stoked-cenv/lib';

import { BaseCommand } from './base.command';

@SubCommand({
              name: 'materialize', description: `Materialize cenv parameters from parameter store to app config`, aliases: ['m', 'mat'],
            })
export class ParamsMaterializeCommand extends BaseCommand {
  constructor() {
    super();
    this.config.allowUI = false;
    this.config.packagesRequired = true;
  }
  @Option({
    flags: '-t, --test',
  })
  parseTest(val: boolean): boolean {
    return val;
  }

  async runCommand(passedParam: string[], options: InitCommandOptions, packages: Package[]): Promise<void> {
    try {
      packages?.map(async (p: Package) => {
        await p.params?.materialize();
      });
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }
}
