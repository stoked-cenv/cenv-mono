import { Command, CommandRunner, Option, Help } from 'nest-commander';
import {
  CenvLog,
  listStacks,
  BaseCommandOptions,
  Cenv,
  processEnvFiles
} from '@stoked-cenv/cenv-lib'
import { BaseCommand } from './base'

interface EnvCommandOptions extends BaseCommandOptions{
  addedFiles?: string;
  changedFiles?: string;
  deletedFiles?: string;
  listStacks?: string;
  cidr?: boolean;
  exports?: boolean;
}

@Command({
  name: 'env',
  arguments: '[environment]',
  description: 'Manage application environments with this command',
})
export default class EnvCommand extends BaseCommand {
  @Option({
    flags: '-ll, --log-level, <logLevel>',
    description: `Logging mode`,
  })
  parseLogLevel(val: string): string {
    return val;
  }

  @Option({
    flags: '-d, --deploy',
    description: 'Deploy the newly created environment',
  })
  parseDeploy(val: boolean): boolean {
    return val;
  }

  @Option({
    flags: '-added, --added-files [files]',
    description: 'List of newly added environment variables files',
  })
  parseAdded(val: string): string {
    return val;
  }

  @Option({
    flags: '-cf, --changed-files [files]',
    description: 'List of newly changed environment variables files',
  })
  parseChanged(val: string): string {
    return val;
  }

  @Option({
    flags: '-df, --deleted-files [files]',
    description: 'List of deleted environment variable files',
  })
  parseDeleted(val: string): string {
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
    flags: '-l, --list-stacks, [filter]',
    description: `List environment stacks.`,
  })
  parseListStacks(val: string): string {
    return val;
  }

  @Option({
    flags: '-cidr, --cidr',
    description: `Return the current cidr if network exists.`,
  })
  parseCidr(val: boolean): boolean {
    return val;
  }


  @Option({
    flags: '-e, --exports',
    description: `Return exports`,
  })
  parseExports(val: boolean): boolean {
    return val;
  }

  async runCommand(
    params: string[],
    options?: EnvCommandOptions,
  ): Promise<void> {
    try {
      if (options?.listStacks) {
        const filter = typeof options?.listStacks === 'string' ? [options.listStacks] : [];
        const stacks = await listStacks(filter);
        CenvLog.single.infoLog(`stacks:`);
        stacks.forEach(s => CenvLog.single.infoLog(JSON.stringify(s, null, 2)));
        process.exit(0);
      }

      if (options?.addedFiles || options?.changedFiles || options?.deletedFiles) {
        if (params.length !== 1) {
          CenvLog.single.alertLog(`You must provide an environment name when using the added, updated or deleted files options`);
          return;
        }

        await processEnvFiles(params[0],options?.addedFiles?.split(' '),options?.changedFiles?.split(' '), options?.deletedFiles?.split(' '));
        return;
      }
      await Cenv.env(params, options);
    } catch (error) {
      CenvLog.single.catchLog(error);
    }
  }
}
