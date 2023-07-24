import {CommandRunner} from 'nest-commander';
import {Package} from '../common/package'

export interface BaseCommandOptions {
  profile?: string;
  env?: string;
  cli?: boolean;
  logLevel?: string;
  localPackageAccepted?: boolean;
  defaultSuite?: string;
  scopeName?: string;
  help?: boolean;
  skipBuild?: boolean;
  userInterface?: boolean;
}

export abstract class BaseCommand extends CommandRunner {
  allowUI = false;
  args: any;
  localPackageAccepted = true;
  packageRequired = false;
  meta: any;

  async run(passedParams: string[], options?: any) {

    const pkg = new Package();
    await this.runCommand(passedParams, options, [pkg]);
  }

  protected abstract runCommand(passedParam: string[], options?: BaseCommandOptions, packages?: Package[]): Promise<void>;
}
