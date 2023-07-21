import {Command, Option} from 'nest-commander';
import {
  CenvFiles, CenvLog, configure as cenvConfigure, ConfigureCommandOptions, getMatchingProfileConfig, printProfileQuery
} from "@stoked-cenv/lib";
import {BaseCommand} from './base'

import {copyFileSync, existsSync,} from 'fs';
import {join} from 'path';

@Command({
           name: 'configure', description: 'Configure the cli for a specific deployment.', aliases: ['config', 'conf']
         })
export default class ConfigureCommand extends BaseCommand {

  @Option({
            flags: '-ll, --log-level, <logLevel>', description: `Logging mode 2`,
          }) parseLogLevel(val: string): string {
    return val;
  }

  @Option({
            flags: '-k, --key', description: 'Use a custom key',
          }) parseKey(val: boolean): boolean {
    return val;
  }

  @Option({
            flags: '-l, --localstack-api-key <string>', description: 'Set a local stack api key',
          }) parseLocalstackKey(val: string): string {
    return val;
  }

  @Option({
            flags: '-s, --show', description: 'Show the configuration for a specific profile',
          }) parseShow(val: boolean): boolean {
    return val;
  }

  @Option({
            flags: '--profile, <profile>', description: `Query a profile by aws profile`,
          }) parseProfile(val: string): string {
    return val;
  }

  @Option({
            name: 'env', flags: '-env, --env <env>', description: 'Query a profile by environment',
          }) parseEnv(val: string): string {
    return val;
  }

  async set(params: string[], options?: ConfigureCommandOptions) {
    if (params.length === 1) {
      if (params[0] !== 'set') {
        process.exit(6);
      }

      if (!existsSync(CenvFiles.ProfilePath)) {
        CenvLog.single.errorLog('.cenv has not been configured yet')
        process.exit(6);
      } else {

        const profileData = await getMatchingProfileConfig(true, options?.profile, options?.env)
        CenvLog.single.infoLog(`default profile set to ${printProfileQuery(profileData.envConfig.AWS_PROFILE, profileData.envConfig.ENV)}`);
        const defaultPath = join(CenvFiles.ProfilePath, 'default');
        copyFileSync(profileData.profilePath, defaultPath)
      }
    }
  }

  async runCommand(passedParams: string[], options?: ConfigureCommandOptions,): Promise<void> {
    try {
      if (passedParams.length) {
        await this.set(passedParams, options);
        return;
      }
      await cenvConfigure(options, true);
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }
}
