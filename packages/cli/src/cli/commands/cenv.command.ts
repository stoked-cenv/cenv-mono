import { Option, RootCommand } from 'nest-commander';
import { BaseCommandOptions, CenvLog, Package } from '@stoked-cenv/lib';
import { BaseCommand } from './base.command';

interface CenvCommandOptions extends BaseCommandOptions {
  version?: boolean;
  help?: boolean;
  short?: boolean;
}

@RootCommand({
    name: 'cenv',
    options: {
      isDefault: true,
  }})
export class CenvCommand extends BaseCommand {

  constructor() {
    super();

    this.config.configRequired = false;
    this.config.allowPackages = false;
    this.config.cenvRootRequired = true;
  }

  @Option({
    flags: '-v, --version', description: 'Display cenv\'s installed versions including lib and ui',
  })
  parseVersion(val: boolean): boolean {
    return val;
  }

  @Option({
    flags: '-s, --short', description: 'Display cenv cli\'s installed version only',
  })
  parseShort(val: boolean): boolean {
    return val;
  }

  async runCommand(params: string[], options?: CenvCommandOptions, packages?: Package[]): Promise<void> {
    if (options?.version) {
      if (options?.short) {
        console.log(process.env.CENV_VERSION_CLI);
      } else {
        console.log(process.env.CENV_VERSION);
      }
    } else if (this.command.args.length !== this.command.processedArgs.length) {
      // @ts-ignore
      this.command.unknownCommand();
    } else {
      this.command.help();
    }
  }
}
