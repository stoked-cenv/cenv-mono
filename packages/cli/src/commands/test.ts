import {Command, Option} from 'nest-commander';
import {BaseCommandOptions, Cenv, CenvLog, EnvironmentStatus, getMonoRoot, info, infoBold, Package, spawn, Suite} from "@stoked-cenv/lib";
import {BaseCommand} from './base'
import {CenvTest} from "@stoked-cenv/lib";


@Command({
           name: 'test', description: 'Build and push docker containers to ecr'
         })
export default class TestCommand extends BaseCommand {
  @Option({
            flags: '-ll, --log-level, <logLevel>', description: `Logging mode`,
          }) parseLogLevel(val: string): string {
    return val;
  }

  async runCommand(params: string[], options?: BaseCommandOptions, packages?: Package[]): Promise<void> {
    try {

      console.log(info(`cenv test ${infoBold(params.join(' '))} => package(s) loaded: ${packages?.map((p: Package) => infoBold(p.packageName)).join(', ')}`));
      if (!params.length) {
        CenvLog.single.catchLog('must supply a test to the test function');
        process.exit(3429);
      }
      await CenvTest.exec(params.join(' '), packages)
    } catch (e) {
      //CenvLog.single.catchLog(e);
    }
  }
}
