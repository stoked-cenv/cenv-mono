import {CommandRunner} from 'nest-commander';
import {Dashboard} from '@stoked-cenv/ui';
import {
  BaseCommandOptions,
  Cenv,
  configure,
  ConfigureCommandOptions,
  Deployment,
  Package,
  parseCmdParams,
  ProcessMode,
  Version
} from '@stoked-cenv/lib';

export abstract class BaseCommand extends CommandRunner {
  allowUI = false;
  args: any;
  deploymentMode: ProcessMode;
  localPackageAccepted = true;
  packageRequired = false;
  meta: any;

  async run(passedParams: string[], options?: any) {
    Package.callbacks.cancelDependencies = Deployment.cancelDependencies.bind(Deployment);
    Cenv.cleanTags = (...text: string[]) => {
      return Dashboard.cleanTags(...text);
    }
    const runningInit = this.command.name() === 'init' || this.command.name() === 'new';
    await Cenv.cmdInit(options, runningInit);

    if (!process.env.CENV_VERSION) {
      await Version.getVersion('@stoked-cenv/cli');
      await Version.getVersion('@stoked-cenv/lib');
      await Version.getVersion('@stoked-cenv/ui');
    }

    if (runningInit) {
      await this.runCommand(passedParams, options);
      return;
    }

    if (!options?.profile && !options?.env) {
      options.profile = 'default';
    }

    this.args = await configure(options as ConfigureCommandOptions);
    if (!this.allowUI) {
      options.cli = true;
    }
    options.localPackageAccepted = this.localPackageAccepted;
    const passThru = {skipBuild: options.skipBuild};

    const {packages, parsedParams, validatedOptions} = await parseCmdParams(passedParams, options, this.deploymentMode);
    const deployCreateOptions = {
      packages,
      suite: validatedOptions.suite,
      environment: validatedOptions.environment,
      cmd: this.deploymentMode,
      options: validatedOptions
    }
    if (options?.userInterface && !process.env.CENV_SPAWNED) {
      if (!Cenv.dashboard) {
        Cenv.dashboard = new Dashboard(deployCreateOptions);
      }
      process.env.CENV_DEFAULTS = 'true';
    }
    await this.runCommand(parsedParams, {...validatedOptions, ...passThru}, packages);
  }

  protected abstract runCommand(passedParam: string[], options?: BaseCommandOptions, packages?: Package[]): Promise<void>;
}
