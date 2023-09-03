import {Command} from 'nest-commander';
import {CenvLog, Package, ParamsCommandOptions} from '@stoked-cenv/lib';
import {BaseCommand} from './base.command';
import {StackDeployCommand} from './stack.deploy.command';
import {StackDestroyCommand} from './stack.destroy.command';
import {StackUpdateBucketCommand} from './stack.updateBucket.command';

@Command({
  name: 'stack',
  description: 'Deploy, destroy, update bucket, and check status of package stack',
  subCommands: [StackDeployCommand, StackDestroyCommand, StackUpdateBucketCommand],
})
export class StackCommand extends BaseCommand {

  constructor() {
    super();

  }

  async runCommand(params: string[], options: ParamsCommandOptions, packages?: Package[]): Promise<void> {
    try {
      if (packages) {
        for (let i = 0; i < packages.length; i++) {
          const p = packages[i];
          await p.stack?.checkStatus();
        }
      }

    } catch (e: unknown) {
      CenvLog.single.errorLog(e as string);
    }
  }
}
