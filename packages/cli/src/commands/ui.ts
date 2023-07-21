import {Command, Option} from 'nest-commander';
import {CenvUI} from '@stoked-cenv/ui';
import {BaseCommandOptions, Cenv, CenvLog, Package, Suite} from '@stoked-cenv/lib'

import {BaseCommand} from './base';

export interface UICommandOptions extends BaseCommandOptions {
  suite?: string;
  environment?: string;
}

@Command({
           name: 'ui', description: `Launch UI`, aliases: ['s', 'suite'],


         })
export default class UICommand extends BaseCommand {

  constructor() {
    super()
    this.allowUI = true;
    this.localPackageAccepted = false;
  }

  @Option({
            flags: '-ll, --log-level, <logLevel>', description: `Logging mode`,
          }) parseLogLevel(val: string): string {
    return val;
  }

  @Option({
            name: 'suite', flags: '-s, --suite <suite>', description: 'Load a suite into the UI'
          }) parseSuite(val: string): string {
    return val;
  }

  @Option({
            name: 'environment',
            flags: '-e, --environment <environment>',
            description: 'Load an environment into the UI',
          }) parseEnvironment(val: string): string {
    return val;
  }

  async runCommand(passedParam: string[], options: UICommandOptions, packages: Package[]): Promise<void> {
    try {
      if (!packages.length) {
        if (!options.suite) {
          if (Cenv.defaultSuite) {
            options.suite = Cenv.defaultSuite;
          } else {
            CenvLog.err(`No valid suite or packages were provided and no valid defaultSuite was configured in the root cenv.json file`);
            process.exit(0);
          }
        }
        const suite = new Suite(options.suite)
        new CenvUI(options, suite.packages);
      } else {
        new CenvUI(options, packages);
      }
    } catch (e) {
      CenvLog.single.catchLog(e)
    }
  }
}
