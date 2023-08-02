import { Option, SubCommand } from 'nest-commander';
import { BaseCommandOptions, CenvFiles, CenvLog, CenvParams, colors, getEnvironment } from '@stoked-cenv/lib';

import { BaseCommand } from './base.command';
import chalk from 'chalk';

interface PullCommandOptions extends BaseCommandOptions {
  deployed?: boolean;
  environment?: string,
  decrypted?: boolean,
}

@SubCommand({
              name: 'pull', description: 'Pull the latest application configuration', arguments: '[options]',
            })
export class ParamsPullCommand extends BaseCommand {
  @Option({
            flags: '-ll, --log-level, <logLevel>', description: `Logging mode`,
          }) parseLogLevel(val: string): string {
    return val;
  }

  @Option({
            name: 'deployed', flags: '-d, --deployed', description: 'Pull the most up to date variables that have been deployed.',
          }) parseDeployed(val: boolean): boolean {
    return val;
  }

  @Option({
            name: 'decrypted', flags: '-D, --decrypted', description: 'Decrypt the variables before pulling them.',
          }) parseDecrypted(val: boolean): boolean {
    return val;
  }

  @Option({
            name: 'environment',
            flags: '-e, --environment <string>',
            description: 'Supply a different environment than your current environment to update your local stack\'s config to use that environments app config variables.',
          }) parseEnvironment(val: string): string {
    return val;
  }

  async runCommand(passedParam: string[], options: PullCommandOptions): Promise<void> {
    try {

      const config = CenvFiles.GetConfig();
      if (!config) {
        CenvLog.single.errorLog('pull: could not load config');
        process.exit(7);
      }
      if (options.environment) {
        const envRes = await getEnvironment(config.ApplicationId, options.environment);
        if (!envRes) {
          console.log(colors.error(`Environment ${options.environment} not found. Use push --environment [environment name] to create a new environment for this application.`));
          return;
        }
        config.EnvironmentId = envRes.EnvironmentId;
        config.EnvironmentName = options.environment;
        await CenvFiles.SaveEnvConfig(config);
        if (options.deployed) {
          console.log(chalk.blueBright(`Local configuration switched to ${options.environment}. Pulling the latest deployed configuration for the environment.`));
        } else {
          console.log(chalk.blueBright(`Local configuration switched to ${options.environment}. Pulling the latest pre-deploy configuration for the environment.`));
        }
      }

      const materializedConfig = await CenvParams.pull(options?.deployed, options?.decrypted);
    } catch (e) {
      console.log(colors.error(e));
    }
  }
}
