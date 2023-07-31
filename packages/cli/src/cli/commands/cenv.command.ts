import { Option, RootCommand } from 'nest-commander';
import { BaseCommandOptions, CenvLog, Package } from '@stoked-cenv/lib';
import {BaseCommand} from "./base.command";
import { Command } from "commander";

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

  meta: any = {
    _allowExcessArguments: false
  }

  constructor(private readonly cenvLog: CenvLog) {
    super();
  }

  @Option({
            flags: '-v, --version', description: 'Display cenv\'s installed version'
          })
  parseVersion(val: boolean): boolean {
    return val;
  }

  @Option({
            flags: '-h, --help', description: 'Display help for command'
          })
  parseHelp(val: boolean): boolean {
    return val;
  }

  async runCommand(params: string[], options?: CenvCommandOptions, packages?: Package[]): Promise<void> {
    if (options?.version) {
      CenvLog.single.stdLog(process.env.CENV_VERSION);
    } else if (this.command.args.length !== this.command.processedArgs.length) {
      // @ts-ignore
      this.command.unknownCommand();
    } else {
      this.command.help();
    }
  }
}
