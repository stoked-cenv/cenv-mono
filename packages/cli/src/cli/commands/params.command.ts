import { Command, Option } from 'nest-commander';
import { CenvLog, Package, ParamsCommandOptions } from '@stoked-cenv/lib';
import { BaseCommand } from './base.command';
import { ParamsAddCommand } from './params.add.command';
import { ParamsRemoveCommand } from './params.rm.command';
import { InitCommand } from './init.command';
import { ParamsPullCommand } from './params.pull.command';
import { ParamsDeployCommand } from './params.deploy.command';
import { ParamsDestroyCommand } from './params.destroy.command';
import { ParamsMaterializeCommand } from './params.materialize.command';

enum ParamCommands {
  init = 'init', deploy = 'deploy', pull = 'pull', fix = 'fix', materialize = 'materialize'
}

@Command({
  name: 'params', description: 'Init, deploy, and display package parameters', subCommands: [InitCommand, ParamsPullCommand, ParamsDeployCommand, ParamsDestroyCommand, ParamsAddCommand, ParamsRemoveCommand, ParamsMaterializeCommand],
})
export class ParamsCommand extends BaseCommand {

  constructor() {
    super();
    this.config.allowUI = false;
  }

  @Option({
    flags: '-ll, --log-level, <logLevel>', description: `Logging mode`,
  }) parseLogLevel(val: string): string {
    return val;
  }

  @Option({
    name: 'app', flags: '-a, --app', description: 'Displays all app parameters. App parameters are the same across all environments and are not used in other applications.',
  }) parseConfig(val: string): string {
    return val;
  }

  @Option({
    name: 'environment', flags: '-e, --environment', description: 'Displays environment parameters. Environment parameters are unique to each environment and are not used in other applications.',
  }) parseEnvironment(val: string): string {
    return val;
  }

  @Option({
    name: 'global', flags: '-g, --global', description: 'Displays global parameters. Global parameters are available to all applications in all environments.',
  }) parseGlobal(val: string): string {
    return val;
  }

  @Option({
    name: 'globalEnv', flags: '-ge, --global-env', description: 'Displays global environment parameters. Global environment parameters are available to all applications in a specific environment.',
  }) parseGlobalEnv(val: string): string {
    return val;
  }

  @Option({
    name: 'detail', flags: '-d, --detail', description: 'Print all the variable meta data including path, value, and type.',
  }) parseDetail(val: boolean): boolean {
    return val;
  }

  @Option({
    name: 'simple', flags: '-s, --simple', description: 'Print only environment variable and value.', defaultValue: true,
  }) parseSimple(val: boolean): boolean {
    return val;
  }

  @Option({
    name: 'decrypted', flags: '-de, --decrypted', description: 'Display decrypted values on SecureString blessed.',
  }) parseEncrypted(val: boolean): boolean {
    return val;
  }

  @Option({
    name: 'deployed', flags: '-D, --deployed', description: 'Print variable data that has been deployed.',
  }) parseDeployed(val: boolean): boolean {
    return val;
  }

  async runCommand(params: string[], options: ParamsCommandOptions, packages?: Package[]): Promise<void> {
    try {
      options.detail = true;
      packages?.map(async (p: Package) => {
        if (p.params) {
          await p.params.showParams();
        }
      });

    } catch (e) {
      CenvLog.single.errorLog(e as string);
    }
  }
}
