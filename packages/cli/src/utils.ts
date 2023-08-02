import { BaseCommandOptions, Cenv, CenvLog, CommandInfo, Package } from '@stoked-cenv/lib';
import { Dashboard } from '@stoked-cenv/ui';
import { BaseCommand } from './cli/commands';

export interface ICenvCommand {
  config?: CommandInfo;

  runCommand(passedParam: string[], options?: BaseCommandOptions, packages?: Package[]): Promise<void>;
}

export async function cenvSetup(commandName: string, config: CommandInfo, params?: string[], opts?: Record<string, any>) {
  const initRes = await Cenv.cenvSetup(commandName, config, params, opts);
  if (initRes.options?.userInterface && !process.env.CENV_SPAWNED) {
    if (!Cenv.dashboard) {
      initRes.options.dashboardOptions = {
        packages: initRes.packages, cmd: config.deploymentMode, options: initRes.options,
      };
      Cenv.dashboard = new Dashboard(initRes.options.dashboardOptions);
    }
    process.env.CENV_DEFAULTS = 'true';
  }
  return initRes;
}

export async function runCommand(cmd: BaseCommand, params?: string[], options?: Record<string, any>) {
  if (!cmd || !cmd.config) {
    CenvLog.single.catchLog('attempting to exec subCommandRunner() without proper setup');
    process.exit(991);
  }
  const initRes = await cenvSetup(cmd.fullName, cmd.config, params, options);
  await cmd.runCommand(initRes.params, initRes.options, initRes.packages);
}