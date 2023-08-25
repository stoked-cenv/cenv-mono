import { Command, Option } from 'nest-commander';
import { CenvLog, ClientMode, Package, ParamsCommandOptions, startCenv } from '@stoked-cenv/lib';
import { BaseCommand } from './base.command';
import { ParamsAddCommand } from './params.add.command';
import { ParamsRemoveCommand } from './params.rm.command';
import { InitCommand } from './init.command';
import { ParamsPullCommand } from './params.pull.command';
import { ParamsDeployCommand } from './params.deploy.command';
import { ParamsDestroyCommand } from './params.destroy.command';
import { ParamsMaterializeCommand } from './params.materialize.command';
import path from 'path';

@Command({
  name: 'params', description: 'Init, deploy, and display package parameters', subCommands: [InitCommand, ParamsPullCommand, ParamsDeployCommand, ParamsDestroyCommand, ParamsAddCommand, ParamsRemoveCommand, ParamsMaterializeCommand],
})
export class ParamsCommand extends BaseCommand {

  constructor() {
    super();
    this.config.allowUI = false;
  }

  @Option({
    name: 'stage', flags: '-s, --stage <stage>', description: 'Show parameters at the given stage: local, deployed, materialized, or all stages.', defaultValue: 'materialized', choices: ['local', 'deployed', 'materialized', 'all'],
  })
  parseStage(val: string): string {
    return val;
  }

  @Option({
    name: 'diff', flags: '-d, --diff', description: 'Show parameter diff',
  })
  parseDiff(val: boolean): boolean {
    return val;
  }

  @Option({
    name: 'typed', flags: '-t, --typed', description: 'Include param types in output'
  })
  parseTyped(val: boolean): boolean {
    return val;
  }

  @Option({
    name: 'poll', flags: '-p, --poll', description: 'Poll for parameter changes'
  })
  parsePoll(val: boolean): boolean {
    return val;
  }

  @Option({
    name: 'export', flags: '-e, --export', description: 'Print the parameters as exports to be evaluated'
  })
  parseExport(val: boolean): boolean {
    return val;
  }

  async runCommand(params: string[], options: ParamsCommandOptions, packages?: Package[]): Promise<void> {
    try {
      if (packages) {
        for (let i = 0; i < packages.length; i++) {
          const p = packages[i];
          if (options?.poll) {
            await startCenv(ClientMode.REMOTE_POLLING, require(path.resolve('package.json')).name, '* * * * *')
          } else if (p.params) {
            await p.params.showParams(options);
          }
        }
      }

    } catch (e: unknown) {
      CenvLog.single.errorLog(e as string);
    }
  }
}
