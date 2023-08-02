import { CommandRunner, Option } from 'nest-commander';
import { BaseCommandOptions, CenvLog, CommandInfo, Package } from '@stoked-cenv/lib';
import { cenvSetup } from '../../utils';

export abstract class BaseCommand extends CommandRunner {
  config: CommandInfo = new CommandInfo();
  packages: Package[] = [];

  private readonly log: CenvLog = CenvLog.single;

  get options(): Record<string, number | string | boolean> {
    const opts: Record<string, number | string | boolean> = {};
    const optVals = this.command.optsWithGlobals();
    if (!this.command || !this.command.options || !optVals) {
      return opts;
    }
    for (const [key, value] of Object.entries(optVals) as [string, any][]) {
      opts[key] = value;
    }
    return opts;
  }

  get optionsPrintable() {
    if (!this.command || !this.options) {
      return;
    }
    const opts = this.command.optsWithGlobals();
    let keyValueOptions = '';
    for (const [key, value] of Object.entries(opts) as [string, any][]) {
      if (opts) {
        keyValueOptions += `\t\t${key}: ${value}\n`;
      }
    }
    return keyValueOptions;
  }

  get params(): any[] {
    return this.command.processedArgs;
  }

  get name() {
    return this.command.name();
  }

  get fullName() {
    if (!this.command) {
      CenvLog.single.catchLog('BaseCommand::fullName() called before BaseName.command has been initialized');
      process.exit(772);
    }
    let cmd = this.command.parent;
    let result = this.command.name();
    while (cmd) {
      if (cmd.name() === 'cenv') {
        break;
      } else {
        result = `${result}${cmd.name()[0].toUpperCase()}${cmd.name().substring(1)}`;
        cmd = cmd.parent;
      }
    }
    return result;
  }

  @Option({
            flags: '-e, --env <env>', description: 'For managing cenv profiles by environment', env: 'ENV',
          }) parseEnvVar(val: string): string {
    return val;
  }

  @Option({
            flags: '-p, --profile <profile>', description: `Profile to use for aws commands`, env: 'AWS_PROFILE',
          }) parseProfile(val: string): string {
    return val;
  }

  @Option({
            flags: '-ll, --log-level, <logLevel>', description: `Logging mode`, env: 'CENV_LOG_LEVEL',
          }) parseLogLevel(val: string): string {
    return val;
  }

  @Option({
            flags: '-h, --help', description: 'Display help for command',
          }) parseHelp(val: boolean): boolean {
    return val;
  }

  async run(params: string[], options?: BaseCommandOptions) {
    this.processCommandConfig();
    if (this.options['help']) {
      this.command.help();
      process.exit();
    }
    const optionVals = this.options;
    const initRes = await cenvSetup(this.fullName, this.config, params, options);
    this.packages = initRes.packages ? initRes.packages : [];
    if (process.env.CENV_CLI_DEBUG) {
      console.log(`command: ${this.fullName}`);
      if (this.packages && this.packages.length) {
        console.log(`\tpackages: ${this.packages.map((p: Package) => p.packageName).join(', ')}`);
      }
      if (this.params && this.params.length) {
        console.log(`\tparams: ${this.params.join(', ')}`);
      }
      const printableOptions = this.optionsPrintable;
      if (printableOptions) {
        console.log(`\toptions:`);
        console.log(this.optionsPrintable);
      }
    }
    await this.runCommand(initRes.params, { ...initRes.options }, initRes.packages);
  }

  abstract runCommand(passedParam: string[], options?: BaseCommandOptions, packages?: Package[]): Promise<void>;

  private processCommandConfig() {
    if (!this.config.allowPackages) {
      this.config.allowLocalPackage = false;
      this.config.packagesRequired = false;
    }

    if (this.config.allowLocalPackage) {
      this.config.allowPackages = true;
    }

    if (this.config.packagesRequired) {
      this.config.allowPackages = true;
    }
  }
}
