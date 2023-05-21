import { Command, CommandRunner, Option } from 'nest-commander';
import { CenvUI, Suite } from '@stoked-cenv/cenv-ui';
import { CenvLog, Package, BaseCommandOptions } from '@stoked-cenv/cenv-lib'

import { BaseCommand } from './base';

export interface UICommandOptions extends BaseCommandOptions {
  suite?: string;
  environment?: string;
}

@Command({
  name: 'ui',
  description: `Launch UI`,
  aliases: ['s', 'suite', 'status']
})
export default class UICommand extends BaseCommand {

  constructor() {
    super()
    this.allowUI = true;
    this.localPackageAccepted = false;
  }
  @Option({
    flags: '-ll, --log-level, <logLevel>',
    description: `Logging mode`,
  })
  parseLogLevel(val: string): string {
    return val;
  }

  @Option({
    name: 'suite',
    flags: '-s, --suite <suite>',
    description: 'Load a suite into the UI'
  })
  parseSuite(val: string, val2): string {
    return val;
  }

  @Option({
    name: 'environment',
    flags: '-e, --environment <environment>',
    description: 'Load an environment into the UI',
  })
  parseEnvironment(val: string, val2): string {
    return val;
  }

  async runCommand(passedParam: string[], options: UICommandOptions, packages: Package[]): Promise<void> {
    try {
      if (!packages.length) {
        options.suite = options.defaultSuite;
        const suite = new Suite(options.suite)
        CenvLog.single.infoLog(suite.packages.map(p => p.packageName).join(', '))
        new CenvUI(options, suite.packages);
      } else {
        new CenvUI(options, packages);
      }
    } catch (e) {
      CenvLog.single.catchLog(e)
    }
  }
}
