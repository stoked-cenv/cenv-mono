import { Option, SubCommand } from 'nest-commander';
import { BaseCommandOptions, CenvLog, getConfig, Package } from '@stoked-cenv/lib';
import { rmSync } from 'fs';
import { BaseCommand } from './base.command';

interface ParamsDeployCommandOptions extends BaseCommandOptions {
  init?: boolean;
  materialize?: boolean;
}

@SubCommand({
  name: 'deploy', description: 'Deploy local params to AWS Parameter Store', aliases: ['dep', 'i'],
})
export class ParamsDeployCommand extends BaseCommand {
  constructor() {
    super();

  }

  @Option({
    name: 'init', flags: '-i, --init', description: 'Init parameters before deploy',
  })
  parseInit(val: boolean): boolean {
    return val;
  }

  @Option({
            name: 'materialize', flags: '-m, --materialize', description: 'Materialize parameters after deploy',
          })
  parseMaterialize(val: boolean): boolean {
    return val;
  }

  async runCommand(param: string[], options: ParamsDeployCommandOptions, packages?: Package[]): Promise<void> {
    try {
      packages?.map(async (p: Package) => {
        if (p.params) {
          await p.params.deploy(options);
        }
      });

      //}
    } catch (e) {
      console.log(CenvLog.colors.error(e));
    }
  }
}
