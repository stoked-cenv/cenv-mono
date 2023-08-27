import {Command, Option} from 'nest-commander';
import {BaseCommandOptions, Cenv, CenvLog, listStacks, processEnvFiles} from '@stoked-cenv/lib'
import {BaseCommand} from './base.command'

interface EnvCommandOptions extends BaseCommandOptions {
  addedFiles?: string;
  changedFiles?: string;
  deletedFiles?: string;
  listStacks?: string;
  cidr?: boolean;
  exports?: boolean;
}

@Command({
  name: 'env', arguments: '[environment]', description: 'Manage application environments with this command',
})
export class EnvCommand extends BaseCommand {
  constructor() {
    super();
    this.config.allowUI = false;
  }

  @Option({
    flags: '-ll, --log-level, <logLevel>', description: `Logging mode`,
  }) parseLogLevel(val: string): string {
    return val;
  }

  @Option({
    flags: '-d, --deploy', description: 'Deploy the newly created environment',
  }) parseDeploy(val: boolean): boolean {
    return val;
  }

  @Option({
    flags: '-added, --added-files [files]', description: 'List of newly added environment variables files',
  }) parseAdded(val: string): string {
    return val;
  }

  @Option({
    flags: '-cf, --changed-files [files]', description: 'List of newly changed environment variables files',
  }) parseChanged(val: string): string {
    return val;
  }

  @Option({
    flags: '-df, --deleted-files [files]', description: 'List of deleted environment variable files',
  }) parseDeleted(val: string): string {
    return val;
  }

  @Option({
    flags: '-l, --list-stacks, [...filter]', description: `List environment stacks.`, choices: [
      "CREATE_COMPLETE",
      "CREATE_FAILED",
      "CREATE_IN_PROGRESS",
      "DELETE_COMPLETE",
      "DELETE_FAILED",
      "DELETE_IN_PROGRESS",
      "IMPORT_COMPLETE",
      "IMPORT_IN_PROGRESS",
      "IMPORT_ROLLBACK_COMPLETE",
      "IMPORT_ROLLBACK_FAILED",
      "IMPORT_ROLLBACK_IN_PROGRESS",
      "REVIEW_IN_PROGRESS",
      "ROLLBACK_COMPLETE",
      "ROLLBACK_FAILED",
      "ROLLBACK_IN_PROGRESS",
      "UPDATE_COMPLETE",
      "UPDATE_COMPLETE_CLEANUP_IN_PROGRESS",
      "UPDATE_FAILED",
      "UPDATE_IN_PROGRESS",
      "UPDATE_ROLLBACK_IN_PROGRESS"
    ],
  }) parseListStacks(val: string): string {
    return val;
  }

  @Option({
    flags: '-cidr, --cidr', description: `Return the current cidr if network exists.`,
  }) parseCidr(val: boolean): boolean {
    return val;
  }

  @Option({
    flags: '-e, --exports', description: `Return exports`,
  }) parseExports(val: boolean): boolean {
    return val;
  }

  async runCommand(params: string[], options: EnvCommandOptions,): Promise<void> {
    try {
      if (options?.listStacks) {
        const filter = typeof options?.listStacks === 'string' ? [options.listStacks] : [];
        const stacks = await listStacks(filter);
        CenvLog.single.infoLog(`stacks:`);
        stacks.forEach(s => CenvLog.single.infoLog(JSON.stringify(s, null, 2)));
        return;
      } else if (options?.addedFiles || options?.changedFiles || options?.deletedFiles) {
        if (params.length !== 1) {
          CenvLog.single.alertLog(`You must provide an environment name when using the added, updated or deleted files options`);
          return;
        }

        await processEnvFiles(params[0], options?.addedFiles?.split(' '), options?.changedFiles?.split(' '), options?.deletedFiles?.split(' '));
        return;
      }
      await Cenv.env(params, options);
    } catch (error) {
      CenvLog.single.catchLog(error);
    }
  }
}
