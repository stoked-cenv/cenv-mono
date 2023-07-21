import {Option, RootCommand} from 'nest-commander';
import {Package} from "@stoked-cenv/lib";
import {BaseCommand} from "./base";

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

  async runCommand(params: string[], options?: any, packages?: Package[]): Promise<void> {
    if (options.version) {
      console.log(process.env.CENV_VERSION);
    } else {
      //this.command.help();
    }
  }
}
