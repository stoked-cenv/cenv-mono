import { CommandRunner, Option } from 'nest-commander';
import { Dashboard } from '@stoked-cenv/cenv-ui';
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
  parseCmdParams
} from '@stoked-cenv/cenv-lib';

export abstract class BaseCommand extends CommandRunner {
  allowUI = false;
  args: any;
  deploymentMode: ProcessMode;
  localPackageAccepted = true;
  packageRequired = false;
  meta;

  async run(passedParams: string[], options?: any) {

    const pkg = Package.getPackage('GLOBAL');
    if (this.allowUI) {
      pkg.createCmd('clean this up');
    }
    Package.callbacks.cancelDependencies = Deployment.cancelDependencies.bind(Deployment);
    if (!process.env.CENV_VERSION) {
      await Version.getVersion();
    }
    await CenvParams.cmdInit(options);

    this.args = await configure(options as ConfigureCommandOptions);
    if (!this.allowUI) {
      options.cli = true;
    }
    options.localPackageAccepted = this.localPackageAccepted;
    const passThru = { skipBuild: options.skipBuild };

    const { packages, parsedParams, validatedOptions } = await parseCmdParams(passedParams, options, this.deploymentMode);

    CenvParams.dashboardCreateOptions = { packages, suite: validatedOptions.suite, environment: validatedOptions.environment, cmd: this.deploymentMode, options: validatedOptions }
    CenvParams.dashboardCreator = (deployCreateOptions: DashboardCreateOptions) => {
      return new Dashboard(deployCreateOptions);
    }
    if (options?.userInterface && !process.env.CENV_SPAWNED) {
      if (!CenvParams.dashboard) {
        CenvParams.dashboard = CenvParams.dashboardCreator(CenvParams.dashboardCreateOptions);
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
