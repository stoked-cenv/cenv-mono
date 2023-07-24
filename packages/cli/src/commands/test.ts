import {Command, Option} from 'nest-commander';
import {BaseCommandOptions, CenvLog, EnvironmentStatus, getMonoRoot, Package, spawn, Suite} from "@stoked-cenv/lib";
import {BaseCommand} from './base'
import * as path from "path";


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

      /*
      packages.map((p: Package) => {
        //console.log('package: ', p.packagePath)
      });
      await Test.exec(packages, params.join(' '))
       */

      const cenvConfig = require(path.join(getMonoRoot(), './cenv.json'));
      const defaultSuite = cenvConfig.defaultSuite;

      const suite = new Suite(defaultSuite);
      await Promise.all(await Package.checkStatus());
      suite.packages.forEach((p: Package) => {
        if (p.environmentStatus !== EnvironmentStatus.NOT_DEPLOYED) {
          throw new Error(`verify packages not deployed: ${p.packageName}: ${p.environmentStatus}`);
        }
      });

      await spawn(`cenv deploy ${defaultSuite} -ll minimal`);
      await Promise.all(await Package.checkStatus());
      suite.packages.forEach((p: Package) => {
        if (p.environmentStatus !== EnvironmentStatus.UP_TO_DATE) {
          throw new Error(`verify packages up to date: ${p.packageName}: ${p.environmentStatus}`);
        }
      });

      await spawn(`cenv destroy ${defaultSuite} -ll minimal`);
      await Promise.all(await Package.checkStatus());
      suite.packages.forEach((p: Package) => {
        if (p.environmentStatus !== EnvironmentStatus.NOT_DEPLOYED) {
          throw new Error(`verify packages not deployed: ${p.packageName}: ${p.environmentStatus}`);
        }
      });

    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }
}
