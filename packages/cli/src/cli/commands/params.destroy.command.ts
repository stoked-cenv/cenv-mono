import { Option, SubCommand } from 'nest-commander';
import { BaseCommandOptions, CenvLog, Deployment, Package, ParamsModule } from '@stoked-cenv/lib';

import { BaseCommand } from './base.command';

interface DestroyCommandOptions extends BaseCommandOptions {
  all?: boolean;
  globalParameters?: boolean;
  nonGlobalParameters?: boolean;
}

@SubCommand({
  name: 'destroy', description: 'Deploy local params to AWS Parameter Store', aliases: ['des', 'u'],
})
export class ParamsDestroyCommand extends BaseCommand {

  constructor() {
    super();

  }

  @Option({
    flags: '-gp, --global-parameters', description: `Destroy all global parameters`,
  }) parseGlobalParameters(val: boolean): boolean {
    return val;
  }

  @Option({
    flags: '-ngp, --non-global-parameters', description: `Destroy all non global parameters`,
  }) parseNonGlobalParameters(val: boolean): boolean {
    return val;
  }

  @Option({
    flags: '--all', description: `Destroy all global and non global parameters from parameter store as well as all configs from app config`,
  }) parseDestroyParamsAll(val: boolean): boolean {
    return val;
  }

  async runCommand(param: string[], options: DestroyCommandOptions, packages?: Package[]): Promise<void> {
    try {
      const localOnly = packages?.length === 1 && packages[0].local;
      if (options?.globalParameters) {
        await ParamsModule.destroyGlobal();
        process.exit();
        //packages = localOnly ? [] : packages;
        //options.stack = options.docker = options.parameters = false;
      } else if (options?.nonGlobalParameters) {
        await ParamsModule.destroyNonGlobal();
        process.exit();
        //packages = localOnly ? [] : packages;
        //options.stack = options.docker = options.parameters = false;
      } else if (options?.all) {
        await ParamsModule.destroyAllConfigs();
        await ParamsModule.destroyAllParams();
        process.exit();
        //packages = localOnly ? [] : packages;
        //options.stack = options.docker = options.parameters = false;
      } else {
        packages?.map((p: Package) => {
          p.params?.destroy();
        })
      }
      //options = Deployment.deployDestroyOptions(options);
      //await Deployment.Destroy(packages, { ...options, stack: false, docker: false, parameters: false });
    } catch (e) {
      console.log(CenvLog.colors.error(e));
    }
  }
}
