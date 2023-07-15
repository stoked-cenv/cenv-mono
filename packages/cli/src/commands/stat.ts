import { Command, Option } from 'nest-commander';
import {BaseCommandOptions, CenvLog, Package, ProcessStatus} from '@stoked-cenv/lib'
import { BaseCommand } from './base';

export interface StatCommandOptions extends BaseCommandOptions {
  targetMode?: string;
  endStatus?: string;
}

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

  @Option({
    flags: '-t, --target-mode, <targetMode>',
    description: `Target mode`,
  })
  parseTargetMode(val: string): string {
    return val;
  }

  @Option({
    flags: '-e, --end-status, <endStatus>',
    description: `Desired end status`,
  })
  parseEndStatus(val: string): string {
    return val;
  }

  async runCommand(passedParam: string[], options: any, packages: Package[]): Promise<void> {
    try {
      await Promise.allSettled(packages.map((p: Package) => {
        const endStatus: ProcessStatus = options?.endStatus ? Object.values(ProcessStatus)[options.endStatus] : undefined;
        p.checkStatus(options?.targetMode, endStatus);
      }))
    } catch (e) {
      CenvLog.single.catchLog(e)
    }
  }
}
