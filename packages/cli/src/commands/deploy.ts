import {Command, Option} from 'nest-commander';

import {
  addKeyAccount, Cenv, CenvLog, createKey, DeployCommandOptions, Deployment, Package, ProcessMode,
} from '@stoked-cenv/lib';
import {BaseCommand} from './base.command';

@Command({
           name: 'deploy',
           arguments: '[...applications]',
           description: 'Deploy infrastructure',
           aliases: ['i', 'install']
         })
export default class DeployCommand extends BaseCommand {
  deploymentMode = ProcessMode.DEPLOY;
  allowUI = true;
  packageRequired = true;

  /*
    @Option({
      flags: '-b, --bump, <increment>',
      description: `Bump packages if changed by increment type and their dependencies`,
    })
    parseBump(val: string): string {
      return val;
    }

   */

  /*
    @Option({
      flags: '-s, --suite, <suite>',
      description: `Install a named suite of packages (suites.json).`,
    })
    parseSuite(val: string): string {
      return val;
    }

   */

  @Option({
            flags: '-sb, --skip-build', description: `Skip build.`,
          }) parseSkipBuild(val: boolean): boolean {
    return val;
  }

  @Option({
            flags: '-p, --parameters', description: `Only run parameter related commands.`,
          }) parseParameters(val: boolean): boolean {
    return val;
  }

  @Option({
            flags: '-st, --stack', description: `Only run parameter related commands.`,
          }) parseStack(val: boolean): boolean {
    return val;
  }

  @Option({
            flags: '-D, --docker', description: `Only run docker related commands.`,
          }) parseDocker(val: boolean): boolean {
    return val;
  }

  @Option({
            flags: '-cenv, --cenv', description: `Deploy cenv to aws account.`,
          }) parseCenv(val: boolean): boolean {
    return val;
  }

  @Option({
            flags: '-f, --force', description: `Force an action.`,
          }) parseForce(val: boolean): boolean {
    return val;
  }

  @Option({
            flags: '-t, --test', description: `Test an action.`,
          }) parseTest(val: boolean): boolean {
    return val;
  }

  @Option({
            flags: '-v, --verify', description: `Verify the cenv installation on an environment.`,
          }) parseVerify(val: boolean): boolean {
    return val;
  }

  @Option({
            flags: '-k, --key', description: 'Use a custom key',
          }) parseKey(val: boolean): boolean {
    return val;
  }

  @Option({
            flags: '-aka, --add-key-account <account>', description: 'Add an account to have access to the curb key',
          }) parseAddKeyAccount(val: string): string {
    return val;
  }

  @Option({
            flags: '--profile, <profile>',
            description: `Profile to use for aws commands a.k.a. "AWS_PROFILE"`
          }) parseProfile(val: string): string {
    return val;
  }

  @Option({
            flags: '-ll, --log-level, <logLevel>', description: `Logging mode`,
          }) parseLogLevel(val: string): string {
    return val;
  }

  @Option({
            flags: '-b, --bootstrap', description: `Bootstrap cdk under the hood before we run an install.`,
          }) parseBootstrap(val: boolean): boolean {
    return val;
  }

  @Option({
            flags: '-d, --dependencies',
            description: `This flag uses the settings in the deploy package.json for dockerDependencies and componentDependencies. It will build any docker dependencies listed and install and component dependencies listed before installing the specificed package.`
          }) parseDependencies(val: boolean): boolean {
    return val;
  }

  @Option({
            flags: '-sv, --strict-versions',
            description: `Do not create new docker containers if the current version number exists.`,
          }) parseStrictVersions(val: boolean): boolean {
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

  /*
    @Option({
      flags: '-fe, --fail-on-error',
      description: 'Mark the package as failed if any commands have errors'
    })
    parseFailOnError(val: boolean): boolean {
      return val;
    }

   */

  async runCommand(params: string[], options?: DeployCommandOptions, packages?: Package[]): Promise<void> {
    if (options?.verify || options?.cenv || options?.key || options?.addKeyAccount) {
      packages = [];
    }

    try {
      if (options?.cenv) {
        await Cenv.deployCenv(options?.force);
        return;
      }
      if (options?.key) {
        await createKey();
        return;
      } else if (options?.addKeyAccount) {
        await addKeyAccount(options?.addKeyAccount);
        return;
      }

      if ((packages && packages?.length > 0) || (packages?.length === 1 && packages[0].local)) {
        Package.loading = false;
        await Deployment.Deploy(packages, options);
      } else if (!options?.verify) {
        await Cenv.deployCenv(true);
      } else if (options?.verify) {
        const verifyRes = await Cenv.verifyCenv(false);
        process.exit(verifyRes ? 0 : 67);
      }
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }
}
