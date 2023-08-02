import { Command, Option } from 'nest-commander';
import { CenvLog, DockerCommandOptions, Package } from '@stoked-cenv/lib';
import { BaseCommand } from './base.command';

@Command({
           name: 'docker', description: 'Build and push docker containers to ecr',
         })
export class DockerCommand extends BaseCommand {
  @Option({
            flags: '-ll, --log-level, <logLevel>', description: `Logging mode`,
          }) parseLogLevel(val: string): string {
    return val;
  }

  @Option({
            flags: '-b, --build', description: 'Build a docker container', defaultValue: true,
          }) handleBuild(val: boolean): boolean {
    return val;
  }

  @Option({
            flags: '--push', description: 'Push a docker container to ecr', defaultValue: true,
          }) handlePush(val: boolean): boolean {
    return val;
  }

  @Option({
            flags: '-d, --dependencies', description: 'Build docker dependencies first',
          }) handleDependencies(val: boolean): boolean {
    return val;
  }

  @Option({
            flags: '-f, --force', description: `Force an action.`,
          }) parseForce(val: boolean): boolean {
    return val;
  }

  async runCommand(param: string[], options?: DockerCommandOptions, packages?: Package[]): Promise<void> {
    try {
      if (packages) {
        for (let i = 0; i < packages.length; i++) {
          await packages[i]?.docker?.build(this.config?.args, options);
        }
      }
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }
}
