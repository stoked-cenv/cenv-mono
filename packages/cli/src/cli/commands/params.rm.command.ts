import { Option, SubCommand } from 'nest-commander';
import { BaseCommandOptions, CenvLog, CenvParams, deleteParametersByPath, filteredCount, Package, variableTypes } from '@stoked-cenv/lib';
import { BaseCommand } from './base.command';

interface RemoveCommandOptions extends BaseCommandOptions {
  app?: boolean;
  environment?: boolean;
  global?: boolean;
  globalEnv?: boolean;
  kill?: boolean;
  all?: boolean;
  path?: string;
}

@SubCommand({
              name: 'rm', description: 'Add parameter(s) to package', arguments: '[key] [moreKeys...]',
            })
export class ParamsRemoveCommand extends BaseCommand {

  constructor() {
    super();

  }

  @Option({
            name: 'app type',
            flags: '-A, --app-type',
            description: 'Adds an app parameter. App parameters are the same across all environments and are not used in other applications.',
          }) parseConfig(val: boolean): boolean {
    return val;
  }

  @Option({
            name: 'environment type',
            flags: '-E, --environment-type',
            description: 'Adds an environment parameter. Environment parameters are unique to each environment and are not used in other applications.',
          }) parseEnvironment(val: boolean): boolean {
    return val;
  }

  @Option({
            name: 'global type',
            flags: '-G, --global-type',
            description: 'Adds a global parameter. Global parameters are available to all applications in all environments.',
          })
  parseGlobal(val: boolean): boolean {
    return val;
  }

  @Option({
            name: 'globalEnv type',
            flags: '-GE, --global-env-type',
            description: 'Adds a global environment parameter. Global environment parameters are available to all applications in a single environment.',
          })
  parseGlobalEnv(val: boolean): boolean {
    return val;
  }

  @Option({
            name: 'kill',
            flags: '-k, --kill',
            description: 'Forces the system to actually delete the parameter. This is not recommended. This parameter may be used by another service.',
          })
  parseKill(val: boolean): boolean {
    return val;
  }

  @Option({
            name: 'all',
            flags: '--all',
            description: 'Removes all parameters related to the service. Global links will be removed but the parameters will remain.',
          })
  parseAll(val: boolean): boolean {
    return val;
  }

  @Option({
            name: 'path', flags: '-P, --path, [path]', description: 'Removes everything under the given paths hierarchy in AWS Parameter Store.',
          })
  parsePath(val: string): string {
    return val;
  }

  printRm(key: string, type: string) {
    CenvLog.colors.info('removing parameter ' + CenvLog.colors.infoBold(key) + ' from ' + CenvLog.colors.infoBold(type));
  }

  async runCommand(params: string[], options?: RemoveCommandOptions, packages?: Package[]): Promise<void> {
    try {

      if (options?.path) {
        await deleteParametersByPath(options?.path);
        return;
      }

      if (!options) {
        return;
      }

      const types = filteredCount(Object.keys(options), variableTypes);
      if (types.length > 1) {
        CenvLog.single.errorLog(`Must only contain zero or one type flag (${CenvLog.colors.infoBold('--app-type')}, ${CenvLog.colors.infoBold('--environment-type')}, ${CenvLog.colors.infoBold('--global-type')}, ${CenvLog.colors.infoBold('--global-env-type')}`);
        return;
      }

      const originalCwd = process.cwd();
      if (packages?.length) {
        for (let i = 0; i < packages?.length;) {
          const app = packages.shift();
          const allTypes = originalCwd === app?.path;
          if (app && app.chDir() && app.params) {
            await app.params.removeParameters(params, { ...options, allTypes}, types);
          }
        }
        return;
      }

    } catch (e) {
      CenvLog.single.errorLog(e as string);
    }
  }

}
