import { CommandRunner, Option } from 'nest-commander';
import {Dashboard} from '@stoked-cenv/ui';
import {
  BaseCommandOptions, Cenv, CenvLog, Package, parseCmdParams, ProcessMode,
} from '@stoked-cenv/lib';

export abstract class BaseCommand extends CommandRunner {
  allowUI = false;
  args: any;
  deploymentMode?: ProcessMode;
  localPackageAccepted = true;
  packageRequired = false;
  meta: any;
  static log: CenvLog;

  @Option({
    name: 'profile',
    flags: '--profile <profile>',
    description: `Profile to use for aws commands a.k.a. "AWS_PROFILE"`
  })
  parseVersion(val: boolean): boolean {
    return val;
  }

  async run(passedParams: string[], options?: BaseCommandOptions) {
    console.log('help', options)
    this.command.help();
    if (options?.help) {
      this.command.help();
      process.exit();
    }
    const cenvRootNotRequired = this.command.name() === 'init' || this.command.name() === 'new';
    const opt: any = options;
    await Cenv.cmdInit(opt, cenvRootNotRequired);

    this.args = opt?.args;

    if (cenvRootNotRequired) {
      await this.runCommand(passedParams, options);
      return;
    }
    if (!this.allowUI) {
      opt.cli = true;
    }
    opt.localPackageAccepted = this.localPackageAccepted;
    const passThru = {skipBuild: opt.skipBuild};

    const {packages, parsedParams, validatedOptions} = await parseCmdParams(passedParams, opt, this.deploymentMode);
    const deployCreateOptions = {
      packages,
      suite: validatedOptions.suite,
      environment: validatedOptions.environment,
      cmd: this.deploymentMode,
      options: validatedOptions
    }
    if (opt?.userInterface && !process.env.CENV_SPAWNED) {
      if (!Cenv.dashboard) {
        Cenv.dashboard = new Dashboard(deployCreateOptions);
      }
      process.env.CENV_DEFAULTS = 'true';
    }
    await this.runCommand(parsedParams, {...validatedOptions, ...passThru}, packages);
  }

  protected abstract runCommand(passedParam: string[], options?: BaseCommandOptions, packages?: Package[]): Promise<void>;
}
