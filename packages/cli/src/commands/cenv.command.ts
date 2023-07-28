import { Help, Option, RootCommand } from 'nest-commander';
import { BaseCommandOptions, CenvLog, Package } from '@stoked-cenv/lib';
import {BaseCommand} from "./base.command";


interface CenvCommandOptions extends BaseCommandOptions {
  version?: boolean;
  help?: boolean;

}

@RootCommand({
  name: 'cenv',
  options: {
    isDefault: true
  }
})
export class CenvCommand extends BaseCommand {
  constructor(private readonly cenvLog: CenvLog) {
    super();
  }
  @Option({
    name: 'version', flags: '-v, --version', description: 'Display cenv\'s installed version'
  })
  parseVersion(val: boolean): boolean {
    return val;
  }

  async runCommand(params: string[], options?: CenvCommandOptions, packages?: Package[]): Promise<void> {
    if (options?.version) {
      CenvLog.single.stdLog(process.env.CENV_VERSION);
    } else {
      this.command.help();
    }
  }
}
