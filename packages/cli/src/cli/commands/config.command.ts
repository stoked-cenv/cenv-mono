import {Command, Option} from 'nest-commander';
import {Cenv, CenvLog, Config, ConfigCommandOptions, Package, ConfigQuery} from '@stoked-cenv/lib';
import {BaseCommand} from './base.command';
import {ManageConfigCommand} from './config.manage.command';

@Command({
  name: 'config',
  description: 'Configure the cli for a specific aws profile and environment combination.',
  aliases: ['conf'],
  subCommands: [ManageConfigCommand],
})
export class ConfigCommand extends BaseCommand {

  constructor() {
    super();

    this.config.allowPackages = false;
    this.config.configRequired = false;
    this.config.cenvRootRequired = true;
  }

  @Option({
    flags: '-s, --show', description: 'Show the configuration for a specific profile',
  }) parseShow(val: boolean): boolean {
    return val;
  }

  async runCommand(params: string[], options  ?: ConfigCommandOptions, packages?: Package[]): Promise<void> {
    try {
      if (params.length > 1) {
        CenvLog.single.errorLog(`Too many parameters provided to config command.. only accepts one param which is the profile name..`);
        process.exit(22);
      }
      const profile = params.length ? params[0] : options?.profile;
      Cenv.config = new Config();
      if (options?.show) {
        await Cenv.config.show(profile);
        process.exit();
      }
      if (profile) {
        const query = new ConfigQuery({name: profile});
        if (query.valid) {
          await Cenv.config.loadProfile(profile);
          process.exit();
        }
      }
      await Cenv.config.createNewProfile(profile);
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }
}
