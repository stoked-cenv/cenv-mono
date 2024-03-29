import { Command, Option } from 'nest-commander';
import { CenvUI } from '@stoked-cenv/ui';
import { BaseCommandOptions, Cenv, CenvLog, Package, Suite } from '@stoked-cenv/lib';

import { BaseCommand } from './base.command';

export interface UICommandOptions extends BaseCommandOptions {
  suite?: string;
  environment?: string;
}

@Command({
           name: 'ui', description: `Launch UI to manage an environment's infrastructure`, aliases: ['s', 'suite'],
         })
export class UICommand extends BaseCommand {
  constructor() {
    super();
    this.config.allowLocalPackage = false;
    this.config.allowUI = true;
  }

  @Option({
            flags: '-ll, --log-level, <logLevel>', description: `Logging mode`,
          }) parseLogLevel(val: string): string {
    return val;
  }

  @Option({
            name: 'suite', flags: '-s, --suite <suite>', description: 'Load a suite into the UI',
          }) parseSuite(val: string): string {
    return val;
  }

  @Option({
            name: 'environment', flags: '-e, --environment <environment>', description: 'Load an environment into the UI',
          }) parseEnvironment(val: string): string {
    return val;
  }

  async runCommand(passedParam: string[], options: UICommandOptions, packages: Package[]): Promise<void> {
    try {
      if (!packages.length) {
        if (!options.suite) {
          options.suite = Suite.defaultSuite;
        }
        const suite = new Suite(options.suite);
        console.log('suite', suite);
        new CenvUI(options, suite.packages);
      } else {
        new CenvUI(options, packages);
      }
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }
}
