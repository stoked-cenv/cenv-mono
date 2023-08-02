import { Option, SubCommand } from 'nest-commander';
import { BaseCommandOptions, CenvFiles, CenvLog, CenvParams, colors, createEnvironment, getEnvironment } from '@stoked-cenv/lib';

import { BaseCommand } from './base.command';

interface PushCommandOptions extends BaseCommandOptions {
  deploy?: boolean;
  environment?: string;
}

@SubCommand({
              name: 'push', description: 'Push locally updated application configuration variables',
            })
export class ParamsPushCommand extends BaseCommand {
  @Option({
            flags: '-ll, --log-level, <logLevel>', description: `Logging mode`,
          }) parseLogLevel(val: string): string {
    return val;
  }

  @Option({
            flags: '-d, --deploy', description: 'Deploy the new application configuration after pushing the changes',
          }) handleDeploy(val: boolean): boolean {
    return val;
  }

  @Option({
            flags: '-e, --environment [string]',
            description: 'Push the current configuration to a different environment. If the environment does not exist, use --create to create it',
          }) handleEnv(val: string): string {
    return val;
  }

  @Option({
            flags: '-c, --create', description: 'If the environment does not exist, use --create to create it',
          }) handleCreate(val: string): string {
    return val;
  }

  async runCommand(param: string[], options: PushCommandOptions): Promise<void> {
    try {
      const config = CenvFiles.GetConfig();
      if (!config) {
        CenvLog.single.errorLog('push: could not load config');
        process.exit(8);
      }
      if (options?.environment) {
        const envRes = await getEnvironment(config.ApplicationId, options.environment);
        if (!envRes) {
          const newEnv = await createEnvironment(config.ApplicationId, options.environment);
          config.EnvironmentId = newEnv.EnvironmentId;
          config.EnvironmentName = newEnv.EnvironmentName;
          CenvFiles.SaveEnvConfig(config);
          console.log(`created environment ${options.environment}`);
          return;
        } else {
          config.EnvironmentId = envRes.EnvironmentId;
        }
        config.EnvironmentName = options.environment;
      }
      if (options.deploy) {
        await CenvParams.push(options.deploy);
      }
    } catch (e) {
      console.log(colors.error(e));
    }
  }
}
