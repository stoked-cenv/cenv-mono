import { Command, Option } from 'nest-commander';
import {
  Cenv,

  Dashboard,
  Deployment,
  DeploymentMode,
  DestroyCommandOptions,
} from '@stoked-cenv/cenv-ui';
import { Package, CenvLog, CenvFiles, EnvConfigFile } from '@stoked-cenv/cenv-lib';
import { BaseCommand } from './base';

@Command({
  name: 'destroy',
  arguments: '[...applications]',
  description: 'The destroyer of things (suites, environments, stacks, app config, parameters, and ecr)',
  aliases: ['u', 'uninstall'],

})
export default class DestroyCommand extends BaseCommand {
  deploymentMode = DeploymentMode.DESTROY;
  constructor() {
    super()
    this.allowUI = true;
  }

  @Option({
    flags: '-ll, --log-level, <logLevel>',
    description: `Logging mode`,
  })
  parseLogLevel(val: string): string {
    return val;
  }

  @Option({
    flags: '-s, --suite, <suite>',
    description: `Install a named suite of packages.`,
  })
  parseSuite(val: string): string {
    return val;
  }

  @Option({
    flags: '-e, --environment',
    description: `Destroy everything deployed for the current environment`,
  })
  parseEnvironment(val: boolean): boolean {
    return val;
  }

  @Option({
    flags: '-p, --parameters',
    description: `Destroy parameters`,
  })
  parseParameters(val: boolean): boolean {
    return val;
  }
  @Option({
    flags: '-s, --stack',
    description: `Destroy stack`,
  })
  parseStack(val: boolean): boolean {
    return val;
  }

  @Option({
    flags: '-cenv, --cenv',
    description: `Destroy cenv components from an aws account.`,
  })
  parseCenv(val: boolean): boolean {
    return val;
  }
  @Option({
    flags: '-g, --global',
    description: `Destroy global parameters, ecr images, and cenv components after everything else is gone`,
  })
  parseGlobal(val: boolean): boolean {
    return val;
  }


  /* SHARED */
  @Option({
    flags: '--profile, <profile>',
    description: `Environment profile to use on deployments.`,
    defaultValue: 'default',
  })
  parseProfile(val: string): string {
    return val;
  }

  /*
  @Option({
    flags: '-b, --bootstrap',
    description: `Bootstrap cdk under the hood before we run an install.`,
  })
  parseBootstrap(val: boolean): boolean {
    return val;
  }
   */

  @Option({
    flags: '-d, --dependencies',
    description: `This flag uses the settings in the deploy package.json for dockerDependencies and componentDependencies. It will build any docker dependencies listed and install and component dependencies listed before installing the specificed package.`
  })
  parseDependencies(val: boolean): boolean {
    return val;
  }

  @Option({
    flags: '-sv, --strict-versions',
    description: `Do not create new docker containers if the current version number exists.`,
  })
  parseForce(val: boolean): boolean {
    return val;
  }

  @Option({
    flags: '-cli, --cli',
    description: 'Use the cli',
  })
  parseCli(val: boolean): boolean {
    return val;
  }

  @Option({
    flags: '-ui, --user-interface',
    description: 'Use the ui',
  })
  parseUi(val: boolean): boolean {
    return val;
  }

  @Option({
    flags: '-fe, --fail-on-error',
    description: 'Mark the package as failed if any commands have errors'
  })
  parseFailOnError(val: boolean): boolean {
    return val;
  }

  @Option({
    flags: '-p, --parameters',
    description: `Only run  parameter related commands.`,
  })
  parsePA(val: boolean): boolean {
    return val;
  }

  @Option({
    flags: '-D, --docker',
    description: `Only run docker related commands.`,
  })
  parseDocker(val: boolean): boolean {
    return val;
  }

  async destroyAppData(options) {
    const config = CenvFiles.GetConfig();
    if (!config) {
      CenvLog.single.errorLog(`no ${EnvConfigFile.NAME} found in ${process.cwd()}: failed attempt to remove parameter data`)
      process.exit(1);
    }

    const cenvPackage = Package.getPackageName();

    if (options?.parameters) {
      await Deployment.destroyParameters(cenvPackage, !!options?.global, !!options?.global);
      await Deployment.destroyConfig(options?.global ? undefined : cenvPackage);
    }

  }

  async runCommand(
    params: string[],
    options?: DestroyCommandOptions,
    packages?: Package[]
  ): Promise<void> {
    try {

      if (!options?.suite && !options?.environment && (options?.parameters || options?.stack || options?.docker || options?.cenv)) {
        options.cli = true;
        options.userInterface = false;

        if (options?.cenv) {
          await Cenv.destroyCenv();
          if (!options.parameters && !options.stack && !options.docker) {
            return;
          }
        }
        if (packages?.length) {
          for (let i = 0; i < packages.length; i++) {
            const pkg = packages[i]
            if (pkg.chDir()) {
              await Deployment.destroyNonStack(pkg, options.docker, options.parameters, options.parameters);
            }
          }
          return;
        }
      }

      Dashboard.log('pre deploy')
      if (options?.suite || options?.environment || packages?.length > 0) {
        Dashboard.log('pre deploy w/ packages')
        options = Deployment.deployDestroyOptions(options);
        await Deployment.Destroy(packages, options);
      }
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }
}
