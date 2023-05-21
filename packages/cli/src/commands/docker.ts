import { Command, CommandRunner, Option } from 'nest-commander';
import { Deployment, DockerCommandOptions } from '@stoked-cenv/cenv-ui';
import { errorInfo, Package, CenvLog } from '@stoked-cenv/cenv-lib';

import { BaseCommand } from './base'
import path from 'path';


@Command({
  name: 'docker',
  description: 'Build and push docker containers to ecr'
})
export default class DockerCommand extends BaseCommand {
  @Option({
    flags: '-ll, --log-level, <logLevel>',
    description: `Logging mode`,
  })
  parseLogLevel(val: string): string {
    return val;
  }

  @Option({
    flags: '-b, --build',
    description: 'Build a docker container',
    defaultValue: true
  })
  handleBuild(val: boolean): boolean {
    return val;
  }
  @Option({
    flags: '--push',
    description: 'Push a docker container to ecr',
    defaultValue: true
  })
  handlePush(val: boolean): boolean {
    return val;
  }

  @Option({
    flags: '-d, --dependencies',
    description: 'Build docker dependencies first'
  })
  handleDependencies(val: boolean): boolean {
    return val;
  }

  @Option({
    flags: '--profile, <profile>',
    description: `Environment profile to use on init.`,
    defaultValue: 'default',
  })
  parseProfile(val: string): string {
    return val;
  }

  @Option({
    flags: '-f, --force',
    description: `Force an action.`,
  })
  parseForce(val: boolean): boolean {
    return val;
  }

  async runCommand(param: string[], options?: DockerCommandOptions, packages?: Package[]): Promise<void> {
    try {
      if (packages.length && !packages[0].local) {
        for (let i = 0; i < packages.length; i++) {
          await Deployment.DockerBuild(packages[i], this.args, options);
        }
      } else if (packages.length && packages[0].local) {
        await Deployment.DockerBuild(packages[0], this.args, options);
      }
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }
}
