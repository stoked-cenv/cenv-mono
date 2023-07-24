import {Option, RootCommand} from 'nest-commander';
import {BaseCommandOptions, Package} from "@stoked-cenv/lib";
import {BaseCommand} from "./base";


interface CenvCommandOptions extends BaseCommandOptions {
  version?: boolean;
  help?: boolean;

}

@RootCommand({
               name: 'cenv',
             })
export default class CenvCommand extends BaseCommand {

  constructor() {
    super();
  }

  @Option({
            name: 'version', flags: '-v, --version', description: 'Display cenv\'s installed version',
          }) parseVersion(val: boolean): boolean {
    return val;
  }

  async runCommand(params: string[], options?: CenvCommandOptions, packages?: Package[]): Promise<void> {
    if (options?.version) {
      console.log(process.env.CENV_VERSION);
    } else {
      //this.command.help();
    }
  }
}
