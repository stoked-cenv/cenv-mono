import { CommandRunner, Option } from 'nest-commander';
import {
  BaseCommandOptions,
  CenvLog,
  CommandInfo,
  Package,
} from '@stoked-cenv/lib';
import { initCmd } from '../../utils'


export abstract class BaseCommand extends CommandRunner {
  config?: CommandInfo;
  packages: Package[] = []

  constructor(private readonly cenvLog: CenvLog) {
    super();
  }

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
  get params(): any[] { return this.command.processedArgs }

  get name() { return this.command.name() }

  @Option({
    flags: '-e, --env <env>',
    description: 'For managing cenv profiles by environment',
    env: 'ENV'
  })
  parseEnvVar(val: string): string {
    return val;
  }

  @Option({
    flags: '-p, --profile <profile>',
    description: `Profile to use for aws commands`,
    env: 'AWS_PROFILE'
  })
  parseProfile(val: string): string {
    return val;
  }

  @Option({
    flags: '-ll, --log-level, <logLevel>',
    description: `Logging mode`,
    env: 'CENV_LOG_LEVEL'
  })
  parseLogLevel(val: string): string {
    return val;
  }

  @Option({
    flags: '-h, --help', description: 'Display help for command'
  })
  parseHelp(val: boolean): boolean {
    return val;
  }

  async run(params: string[], options?: BaseCommandOptions) {
    const optionVals = this.options;
    if (optionVals['help']) {
      this.command.outputHelp();
      process.exit();
    }
    this.config = new CommandInfo(this.command.name(), this.command.parent?.name());
    const initRes = await initCmd(this.config, params, options)
    this.packages = initRes.packages ? initRes.packages : [];
    console.log(`command: ${this.config.fullName}`);
    if (this.packages && this.packages.length) {
      console.log(`\tpackages: ${this.packages.map((p: Package) => p.packageName).join(', ')}`);
    }
    if (this.params && this.params.length) {
      console.log(`\tparams: ${this.params.join(', ')}`);
    }
    const printableOptions = this.optionsPrintable;
    if (printableOptions) {
      console.log(`\toptions:`);
      console.log(this.optionsPrintable)
    }
    await this.runCommand(initRes.params, {...initRes.options}, initRes.packages);
  }

  abstract runCommand(passedParam: string[], options?: BaseCommandOptions, packages?: Package[]): Promise<void>;
}
