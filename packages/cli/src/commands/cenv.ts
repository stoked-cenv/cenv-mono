import { CommandRunner, Option, RootCommand } from 'nest-commander';
import { packagePath } from '@stoked-cenv/lib'

import path from "path";

@RootCommand({
  name: 'cenv',
})
export default class CenvCommand extends CommandRunner {

  constructor() {
    super();
  }

  @Option({
    name: 'version',
    flags: '-v, --version',
    description: 'Display cenv\'s installed version',
  })
  parseVersion(val: boolean): boolean {
    return val;
  }

  async run(passedParams: string[], options?: any) {
    if (options.version) {
      const rootPath = packagePath('@stoked-cenv/cli');
      console.log('v' + require(path.resolve(rootPath, 'package.json')).version);
    } else {
      this.command.help();
    }
  }
}
