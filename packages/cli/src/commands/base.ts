import { CommandRunner, Option } from 'nest-commander';
import { Dashboard } from '@stoked-cenv/ui';
import {
  ConfigureCommandOptions,
  BaseCommandOptions,
  configure,
  ProcessMode,
  Package,
  CenvParams,
  Version,
  DashboardCreateOptions,
  CenvLog,
  Deployment,
  parseCmdParams,
  Cenv
} from '@stoked-cenv/lib';

export abstract class BaseCommand extends CommandRunner {
  allowUI = false;
  args: any;
  deploymentMode: ProcessMode;
  localPackageAccepted = true;
  packageRequired = false;
  meta: any;

  async run(passedParams: string[], options?: any) {

    const pkg = Package.getPackage('GLOBAL');
    if (this.allowUI) {
      pkg.createCmd('clean this up');
    }
    Package.callbacks.cancelDependencies = Deployment.cancelDependencies.bind(Deployment);
    if (!process.env.CENV_VERSION) {
      await Version.getVersion();
    }

    await Cenv.cmdInit(options);

    this.args = await configure(options as ConfigureCommandOptions);
    if (!this.allowUI) {
      options.cli = true;
    }
    options.localPackageAccepted = this.localPackageAccepted;
    const passThru = { skipBuild: options.skipBuild };

    const { packages, parsedParams, validatedOptions } = await parseCmdParams(passedParams, options, this.deploymentMode);
    const deployCreateOptions = { packages, suite: validatedOptions.suite, environment: validatedOptions.environment, cmd: this.deploymentMode, options: validatedOptions }
    if (options?.userInterface && !process.env.CENV_SPAWNED) {
      if (!Cenv.dashboard) {
        Cenv.dashboard = new Dashboard(deployCreateOptions);
      }
      process.env.CENV_DEFAULTS = 'true';
    }
    await this.runCommand(parsedParams, { ...validatedOptions, ...passThru }, packages);
  }
  @Option({
    flags: '-ll, --log-level, <logLevel>',
    description: `Logging mode`,
  })
  parseLogLevel(val: string): string {
    return val;
  }
  @Option({
    flags: '--profile, <profile>',
    description: `Environment profile to use on init.`,
    defaultValue: 'default',
  })
  parseProfile(val: string): string {
    return val;
  }
  protected abstract runCommand(passedParam: string[], options?: BaseCommandOptions, packages?: Package[]): Promise<void>;
}
