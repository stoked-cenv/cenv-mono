import { Command, Option } from 'nest-commander';
import { CenvLog, Package, Suite } from '@stoked-cenv/lib'
import { BaseCommand } from './base';

//export interface StatCommandOptions extends BaseCommandOptions {
//  environment?: string;
//}

@Command({
  name: 'stat',
  description: `Get the state of a package's current code as it compares to the infrastructure`,
  aliases: ['status'],
})
export default class StatusCommand extends BaseCommand {

  constructor() {
    super()
    this.allowUI = false;
    this.localPackageAccepted = true;
  }

  @Option({
    flags: '-ll, --log-level, <logLevel>',
    description: `Logging mode`,
  })
  parseLogLevel(val: string): string {
    return val;
  }

  async runCommand(passedParam: string[], options: any, packages: Package[]): Promise<void> {
    try {
      await Promise.allSettled(packages.map((p: Package) => {
        p.checkStatus();
      }))
    } catch (e) {
      CenvLog.single.catchLog(e)
    }
  }
}