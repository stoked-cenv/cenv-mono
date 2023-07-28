import {Command, Option} from 'nest-commander';
import {
  CenvFiles, CenvLog, Cenv, ConfigureCommandOptions, getMatchingProfileConfig, printProfileQuery
} from "@stoked-cenv/lib";
import {BaseCommand} from './base.command'

import {copyFileSync, existsSync,} from 'fs';
import {join} from 'path';

@Command({
   name: 'configure',
   description: 'Configure the cli for a specific deployment.',
   aliases: ['config', 'conf']
})
export default class ConfigureCommand extends BaseCommand {
  @Option({
    flags: '-ll, --log-level, <logLevel>',
            description: `Logging mode 2`
  })
  parseLogLevel(val: string): string {
    return val;
  }


  @Option({
            flags: '-s, --show',
            description: 'Show the configuration for a specific profile',
          })
  parseShow(val: boolean): boolean {
    return val;
  }

  async set(params: string[], options?: ConfigureCommandOptions) {
    if (params.length === 1) {
      if (params[0] !== 'set') {
        process.exit(6);
      }

      if (!existsSync(CenvFiles.PROFILE_PATH)) {
        CenvLog.single.errorLog('.cenv has not been configured yet')
        process.exit(6);
      } else {

        const profileData = await getMatchingProfileConfig(true, options?.profile, options?.env)
        if (profileData.envConfig) {
          CenvLog.single.infoLog(`default profile set to ${printProfileQuery(profileData.envConfig.AWS_PROFILE!, profileData.envConfig.ENV!)}`);
        }
        const defaultPath = join(CenvFiles.PROFILE_PATH, 'default');
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
      if (!options?.show) {
        await Cenv.configure(options, true);
      }
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }
}
