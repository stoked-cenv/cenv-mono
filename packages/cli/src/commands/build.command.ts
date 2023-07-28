import {Command, Option} from 'nest-commander';
import {Cenv, CenvLog, LibModule, Package, Suite} from '@stoked-cenv/lib'
import {BaseCommand} from './base.command'

@Command({
           name: 'build', description: `Build packages`,
         })
export class BuildCommand extends BaseCommand {

  constructor(private readonly cenvLog: CenvLog) {
    super();
    BaseCommand.log = cenvLog;
  }

  @Option({
            flags: '-ll, --log-level, <logLevel>', description: `Logging mode`,
          }) parseLogLevel(val: string): string {
    return val;
  }

  @Option({
            flags: '-f, --force', description: `Force build by skipping cached builds`,
          }) parseForce(val: boolean): boolean {
    return val;
  }

  @Option({
            flags: '-i, --install', description: `Run yarn install before build`,
          }) parseInstall(val: boolean): boolean {
    return val;
  }

  @Option({
            flags: '-p, --parallel, <concurrency>', description: `Maximum concurrency`,
          }) parseParallel(val: string): string {
    return val;
  }

  async runCommand(params: string[], options: any, packages: Package[]) {
    try {

      if ((params?.length === 1 && params[0] === 'all') || packages[0].root) {
        new Suite(Cenv.defaultSuite);
        await LibModule.build(options);
      } else if (packages.length) {
        await Promise.all(packages.map(async (p: Package) => p.lib?.build(options.force, true)));
      } else {
        CenvLog.single.alertLog('No packages were supplied or picked up from the current working directory. In order to build something you can supply \'all\' to build everything in the monorepo, a space separated list of packages like "@stoked-cenv/core-middleware-service @stoked-cenv/live-data-service", or a suite such as "curb-cloud"');
      }
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }
}
