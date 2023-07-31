import { Command, Option } from 'nest-commander';
import {
  CenvFiles, CenvLog, Cenv, ConfigCommandOptions, CenvStdio, Package,
} from '@stoked-cenv/lib';
import {BaseCommand} from './base.command'

import {copyFileSync, existsSync,} from 'fs';
import {join} from 'path';
import { RemoveConfigCommand } from './config.rm.command';
import { runCommand } from '../../utils';
import { ListConfigCommand } from './config.ls.command';
import { CenvCommand } from './cenv.command';
import {  } from 'winston';

@Command({
  name: 'config',
  description: 'Configure the cli for a specific aws profile and environment combination.',
  aliases: ['conf'],
  subCommands: [RemoveConfigCommand, ListConfigCommand]
})
export class ConfigCommand extends BaseCommand {

  @Option({
            flags: '-s, --show',
            description: 'Show the configuration for a specific profile',
          })
  parseShow(val: boolean): boolean {
    return val;
  }

  async set(params: string[], options?: ConfigCommandOptions) {
    if (params.length === 1) {
      if (params[0] !== 'set') {
        process.exit(6);
      }

      if (!existsSync(CenvFiles.PROFILE_PATH)) {
        CenvLog.single.errorLog('.cenv has not been configured yet')
        process.exit(6);
      } else {
        const profileData = await Cenv.stdio.getMatchingProfileConfig(true, options?.profile, options?.env)
        if (!profileData) {
          CenvStdio.exitNoMatchingProfiles(options?.profile, options?.env);
          process.exit(390);
        }
        if (profileData && profileData.envConfig) {
          CenvLog.single.infoLog(`default profile set to ${CenvStdio.printProfileQuery(profileData.envConfig.AWS_PROFILE!, profileData.envConfig.ENV!)}`);
        }
        const defaultPath = join(CenvFiles.PROFILE_PATH, 'default');
        copyFileSync(profileData.profilePath, defaultPath)
      }
    }
  }

  async runCommand(params: string[], options?: ConfigCommandOptions, packages?: Package[]): Promise<void> {
    try {
      if (params.length && params[0] === 'set') {
        await this.set(params, options);
        return;
      }
      await Cenv.configure(this.options, true)
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }
}
