import { BaseCommandOptions, Cenv, CenvLog, CommandInfo, Package } from '@stoked-cenv/lib';

export interface ICenvCommand {
  config?: CommandInfo;
  runCommand(passedParam: string[], options?: BaseCommandOptions, packages?: Package[]): Promise<void>;
}

export async function cenvSetup(config: CommandInfo, params?: string[], opts?: Record<string, any>) {
  const initRes = await Cenv.cenvSetup(config, params, opts);
  if (initRes.options?.userInterface && !process.env.CENV_SPAWNED) {
    if (!Cenv.dashboard) {
      initRes.options.dashboardOptions = {
        packages: initRes.packages,
        cmd: config.deploymentMode,
        options: initRes.options
      }
      //Cenv.dashboard = new Dashboard(deployCreateOptions);
    }
    process.env.CENV_DEFAULTS = 'true';
  }
  return initRes;
}

export async function runCommand(cmd?: ICenvCommand, params?: string[], options?: Record<string, any>) {
  if (!cmd || !cmd.config) {
    CenvLog.single.catchLog('attemting to exec subCommandRunner() without proper setup');
    process.exit(991);
  }
  const initRes = await cenvSetup(cmd.config, params, options)
  await cmd.runCommand(initRes.params, initRes.options, initRes.packages);
}