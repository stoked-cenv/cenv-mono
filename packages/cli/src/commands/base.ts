import { Command, CommandRunner, Option } from 'nest-commander';
import {
  Cenv,
  Deployment,
  DeploymentMode,
  parseCmdParams,
} from '@stoked-cenv/cenv-ui';
import {
  ConfigureCommandOptions,
  BaseCommandOptions,
  configure,
  Package,
  CenvParams
} from '@stoked-cenv/cenv-lib';

export abstract class BaseCommand extends CommandRunner {
  allowUI = false;
  args: any;
  deploymentMode: DeploymentMode;
  localPackageAccepted = true;
  meta;
  async run(
    passedParams: string[],
    options?: any,
  ): Promise<void> {
    const pkg = Package.getPackage('GLOBAL');
    if (this.allowUI) {
      pkg.createCmd('logs');
    }
    Package.callbacks.cancelDependencies = Deployment.cancelDependencies.bind(Deployment);
    if (!process.env.CENV_VERSION) {
      await Cenv.Version();
    }
    await CenvParams.commandPreload(options);

    this.args = await configure(options as ConfigureCommandOptions);
    if (!this.allowUI) {
      options.cli = true;
    }
    options.localPackageAccepted = this.localPackageAccepted;
    const passThru = { skipBuild: options.skipBuild };
    const { packages, parsedParams, validatedOptions } = await parseCmdParams(passedParams, options, this.deploymentMode);
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
