import { Command, Option } from 'nest-commander';
import { Cenv, CenvLog, Deployment, DestroyCommandOptions, DockerModule, Package, ParamsModule, ProcessMode, Suite } from '@stoked-cenv/lib';
import { BaseCommand } from './base.command';

@Command({
           name: 'destroy',
           arguments: '[...applications]',
           description: 'The destroyer of things (suites, environments, stacks, app config, parameters, and ecr)',
           aliases: ['u', 'uninstall'],

         })
export class DestroyCommand extends BaseCommand {

  constructor() {
    super();
    this.config.packagesRequired = true;
    this.config.allowRootPackage = false;
    this.config.deploymentMode = ProcessMode.DESTROY;
  }

  @Option({
            flags: '-s, --stack', description: `Destroy stack`,
          }) parseStack(val: boolean): boolean {
    return val;
  }

  @Option({
            flags: '-cenv, --cenv', description: `Destroy cenv components from an aws account.`,
          }) parseCenv(val: boolean): boolean {
    return val;
  }

  @Option({
            flags: '-g, --global', description: `Destroy global parameters, ecr images, and cenv components after everything else is gone`,
          }) parseGlobal(val: boolean): boolean {
    return val;
  }


  @Option({
            flags: '-p, --parameters', description: `Destroy parameters`,
          }) parseParameters(val: boolean): boolean {
    return val;
  }

  @Option({
            flags: '-pa, --parameters-all', description: `Destroy all parameters and configs`,
          }) parseParametersAll(val: boolean): boolean {
    return val;
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
            flags: '-p, --parameters', description: `Only run  parameter related commands.`,
          }) parsePA(val: boolean): boolean {
    return val;
  }

  @Option({
            flags: '-ap, --all-parameters',
            description: `Destroy all global and non global parameters from parameter store as well as all configs from app config.`,
          }) parseAp(val: boolean): boolean {
    return val;
  }

  @Option({
            flags: '--all', description: `Destroy everything`,
          }) parseAll(val: boolean): boolean {
    return val;
  }


  @Option({
            flags: '-d, --dependencies',
            description: `This flag uses the settings in the deploy package.json for dockerDependencies and componentDependencies. It will build any docker dependencies listed and install and component dependencies listed before installing the specificed package.`,
          }) parseDependencies(val: boolean): boolean {
    return val;
  }

  @Option({
            flags: '-sv, --strict-versions', description: `Do not create new docker containers if the current version number exists.`,
          }) parseForce(val: boolean): boolean {
    return val;
  }

  @Option({
            flags: '-cli, --cli', description: 'Use the cli',
          }) parseCli(val: boolean): boolean {
    return val;
  }

  @Option({
            flags: '-ui, --user-interface', description: 'Use the ui',
          }) parseUi(val: boolean): boolean {
    return val;
  }

  @Option({
            flags: '-fe, --fail-on-error', description: 'Mark the package as failed if any commands have errors',
          }) parseFailOnError(val: boolean): boolean {
    return val;
  }

  @Option({
            flags: '-ad, --all-docker', description: `Destroy all docker images from every ecr repo as well as the ecr repos themselves`,
          }) parseAd(val: boolean): boolean {
    return val;
  }

  @Option({
            flags: '-D, --docker', description: `Only run docker related commands.`,
          }) parseDocker(val: boolean): boolean {
    return val;
  }

  @Option({
    flags: '-h, --hard', description: `Destroy stack hard using cloudformation delete-stack cli instead of cdk`,
  })
  parseHard(val: boolean): boolean {
    return val;
  }

  async runCommand(params: string[], options?: DestroyCommandOptions, packages?: Package[]): Promise<void> {
    try {


      const localOnly = packages?.length === 1 && packages[0].local;
      if (options?.globalParameters) {
        await ParamsModule.destroyGlobal();
        packages = localOnly ? [] : packages;
        options.stack = options.docker = options.parameters = false;
      }
      if (options?.nonGlobalParameters) {
        await ParamsModule.destroyGlobal();
        packages = localOnly ? [] : packages;
        options.stack = options.docker = options.parameters = false;
      }

      if (options?.allParameters || options?.all) {
        await ParamsModule.destroyAllConfigs();
        await ParamsModule.destroyAllParams();
        packages = localOnly ? [] : packages;
        options.stack = options.docker = options.parameters = false;
      }

      if (options?.allDocker || options?.all) {
        await DockerModule.destroyAll();
        packages = localOnly ? [] : packages;
        options.stack = options.docker = options.parameters = false;
      }

      if (options?.cenv || options?.all) {
        await Cenv.destroyCenv();
        if (!options?.all) {
          return;
        }
        packages = localOnly ? [] : packages;
        options.stack = options.docker = options.parameters = false;
      }

      if ((!options?.allParameters && !options?.allDocker) && options?.suite || options?.environment || (packages && packages?.length > 0) || options?.all) {
        if (options?.all) {
          const suite = new Suite(Suite.defaultSuite);
          packages = suite.packages;
        }
        options = Deployment.deployDestroyOptions(options);
        await Deployment.Destroy(packages, options);
      }

    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }
}
