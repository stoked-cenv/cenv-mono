import path from 'path';
import { Repository } from '@aws-sdk/client-ecr';
import chalk from 'chalk';
import { Environments } from './environment'
import { Cenv } from './cenv'
import {BaseCommandOptions, CenvParams} from "./params";
import {EnvironmentStatus, IPackage, Package, PackageCmd, ProcessStatus} from "./package/package";
import {cleanup, ICmdOptions, printFlag, sleep, Timer, TimerModules} from "./utils";
import Fake from "./fake";
import {ProcessMode} from "./package/module";
import {CenvLog, colors, LogLevel} from "./log";
import {Version} from "./version";
import {listStacks} from "./aws/cloudformation";
import {deleteRepository, describeRepositories} from "./aws/ecr";
import {deleteParametersByPath, stripPath} from "./aws/parameterStore";
import {destroyAppConfig, destroyRemainingConfigs} from "./aws/appConfig";
import * as util from "util";

export interface CdkCommandOptions extends BaseCommandOptions {
  profile?: string;
  dependencies?: boolean;
  strictVersions?: boolean;
  cli?: boolean;
  userInterface?: boolean;
  failOnError?: boolean;
  suite?: string;
  cenv?: boolean;
  test?: boolean;
  stack?: boolean;
  parameters?: boolean;
  docker?: boolean;
}

export interface DockerCommandOptions extends BaseCommandOptions{
  build?: boolean;
  push?: boolean;
  profile?: string;
  application?: string;
  dependencies?: boolean;
  force?: boolean;
}

export interface DeployCommandOptions extends CdkCommandOptions {
  key?: boolean;
  addKeyAccount?: string;
  verify?: boolean;
  force?: boolean;
  bump: string;
  skipBuild?: boolean;
}

export interface DestroyCommandOptions extends CdkCommandOptions {
  global?: boolean;
  environment?: boolean;
}


interface DeploymentDependencies {
  package: Package;
  dependencies: Package[];
}

export class Deployment {
  static toggleDependencies = false;


  static removeDependency(pkg) {
    pkg.deployDependencies?.map(dep => {
      const {dependency, reference} = this.getDeployDependency(pkg, dep);
      if (this.dependencies[dependency.stackName]) {
        this.dependencies[dependency.stackName].dependencies = this.dependencies[dependency.stackName]?.dependencies.filter(deployDep => deployDep.packageName !== reference.packageName);
        if (!this.dependencies[dependency.stackName]?.dependencies.length) {
          delete this.dependencies[dependency.stackName];
        }
      }
    })
  }

  static stopProcessing(pkg) {
    this.processing = this.processing.filter((p: Package) => pkg != p);
    delete this.toProcess[pkg.stackName];
  }

  static addDependency(pkg) {
    if (!Deployment.toggleDependencies) {
      return;
    }

    Package.getPackages().find((p: Package) => p.deployDependencies?.find((dep: Package) => {
      if (dep.packageName === pkg.packageName) {
        const deployDependency = this.getDeployDependency(p, pkg);
        if (this.dependencies[deployDependency.dependency.stackName]) {
          this.dependencies[deployDependency.dependency.stackName].dependencies = this.dependencies[deployDependency.dependency.stackName].dependencies.filter(dep => dep.packageName !== deployDependency.reference.packageName)
          this.dependencies[deployDependency.dependency.stackName].dependencies.push(deployDependency.reference);
        } else {
          this.dependencies[deployDependency.dependency.stackName] = { package: deployDependency.dependency, dependencies: [deployDependency.reference] };
        }
      }
    }));
  }

  static setDeployStatus(pkg: Package, status: ProcessStatus) {
    pkg.processStatus = status;
    switch(status) {
      case ProcessStatus.COMPLETED:
      case ProcessStatus.SKIPPED:
        this.removeDependency(pkg);
      case ProcessStatus.FAILED:
      case ProcessStatus.CANCELLED:
        this.stopProcessing(pkg);
        break;
      case ProcessStatus.READY:
        this.toProcess[pkg.stackName] = pkg;
        this.addDependency(pkg);
        break;
    }
  }

  static asyncProcesses = [];
  static toProcess: { [key: string]: Package } = {};
  static dependencies: { [key: string]: DeploymentDependencies } = {};
  static processing: Package[] = [];
  static completed = [];

  static async cmdDestroy(pkg: Package) {

    if (pkg.params?.hasCenvVars && (this.options.docker || this.options.parameters || this.options.stack)) {

      const toDirVars = path.relative(process.cwd(), pkg.params.path);
      if (toDirVars !== '') {
        process.chdir(toDirVars);
      }

      const cmd = pkg.createCmd(`FIX ME ->>>>>>>>>  cenv destroy${printFlag(this.options, 'docker')}${printFlag(this.options,'parameters')}${printFlag(this.options, 'stack')}`);
      await this.destroyNonStack(pkg, this.options.docker, this.options.parameters, this.options.parameters);
    }

    if (pkg?.docker && this.options?.docker) {
      const cmd = pkg.createCmd('FIX ME ->>>>>>>>> cenv destroy --docker');
      await this.destroyNonStack(pkg, true, false, false);
    }

    if (pkg?.stack && this.options?.stack) {
      await pkg.stack.delete();
    }

    if (pkg?.params && this.options?.parameters) {
      await pkg.pkgCmd('cenv destroy --parameters');
    }
  }

  static async handleFake(pkg: Package): Promise<void> {
    if (process.env.FAKE_SUCCESS) {
      await Fake.success(pkg);
      pkg.environmentStatus = this.isDeploy() ? EnvironmentStatus.UP_TO_DATE : EnvironmentStatus.NOT_DEPLOYED;
    }
  }

  static async cmd(
    stackName,
    name: string,
    options: ICmdOptions = {
      envVars: {},
      cenvVars: {},
      detached: false,
      waitSeconds: 0,
      waitForOutput: undefined,
      stdio: 'inherit',
      getCenvVars: false,
    },
  ) {
    const pkg: Package = Package.cache[stackName];
    try {

      await this.handleFake(pkg);

      if (this.isDeploy()) {
        if (pkg.meta.deployStack) {
          return await pkg.pkgCmd(pkg.meta?.deployStack);
        } else {
          const deployRes = await pkg.deploy(this.options);
          await pkg.checkStatus(ProcessMode.DEPLOY.toString(), pkg.processStatus);
          CenvParams.dashboard.debug(pkg.packageName, 'deploy complete - exit code:', deployRes)
          return deployRes;
        }
      } else {
        if (pkg.meta.destroyStack) {
          const res = await pkg.pkgCmd(pkg.meta.destroyStack);
          await pkg.checkStatus(ProcessMode.DESTROY.toString(), pkg.processStatus);
          return res;
        }
        const destroyRes = await this.cmdDestroy(pkg);
        await pkg.checkStatus(ProcessMode.DESTROY.toString(), pkg.processStatus);
        return destroyRes;
      }
    } catch (e) {
      Deployment.cancelDependencies(pkg);
      this.setDeployStatus(pkg, ProcessStatus.FAILED);
      pkg.err('deployment failed', '223', e);
      pkg.err(e.stack);
      return 223;
    }
  }


  static async packageStart(
    stackName: string,
    message: string,
    envVars: any = {},
  ) {
    process.env.TIMING = 'true';
    const pkg = Package.cache[stackName];

    if (!pkg.timer) {
      pkg.timer = new Timer(pkg.stackName, 'seconds', true);
    } else {
      pkg.timer.reset();
    }
    if (
      pkg.processStatus === ProcessStatus.HAS_PREREQS &&
      pkg?.cmds?.length > 0
    ) {
      pkg.cmds[0].code = 0;
    }
    pkg.statusTime = Date.now();
    TimerModules.title = this.isDeploy() ? 'Deploy' : 'Destroy';
    TimerModules.title += ' Timing Log';

    if (pkg.isGlobal) {
      return;
    }
    this.setDeployStatus(pkg, ProcessStatus.PROCESSING);

    if (this.isDeploy() && !process.env.BOOTSTRAP_COMPLETE) {
      await this.cmd(
        pkg.stackName,
        `boostrapping ${pkg.stackName}`,
        envVars,
      );
      process.env.BOOTSTRAP_COMPLETE = 'true';
    }

    await this.cmd(pkg.stackName, message, {
      envVars,
      getCenvVars: this.isDestroy() ? false : pkg.params?.hasCenvVars,
    });
    const res = pkg.timer?.elapsed(true);


    pkg.setDeployStatus(ProcessStatus.COMPLETED);
    pkg.statusTime = Date.now();
    await sleep(5);

    CenvLog.single.alertLog([pkg.stackName, 'complete']);
    const complete = await this.packageComplete(pkg);
    if (res) {
      TimerModules.push(res);
    }
    if (complete) {
      await sleep(3);
      TimerModules.show();
    }
  }

  static mode(): ProcessMode {
    return this.options?.mode;
  }

  static isDeploy() {
    return this.options.mode === ProcessMode.DEPLOY;
  }

  static isDestroy() {
    return this.options.mode === ProcessMode.DESTROY;
  }

  static packageDone(pkg: Package) {

    switch(pkg.environmentStatus) {
      case EnvironmentStatus.UP_TO_DATE:
        if (this.isDeploy()) return true;
        break;
      case EnvironmentStatus.NOT_DEPLOYED:
        if (this.isDestroy()) return true;
        break;
    }

    switch(pkg.processStatus) {
      case ProcessStatus.COMPLETED:
      case ProcessStatus.FAILED:
      case ProcessStatus.CANCELLED:
        return true;
    }
    return false
  }

  static async packageComplete(packageInfo: Package) {

    if (this.options.bump) {
      await packageInfo.bumpComplete();
    }
    //this.setDeploymentStatuses();
    this.processing = this.processing.filter((p) => p.stackName !== packageInfo.stackName);
    this.completed.push(packageInfo);

    if (this.isDeploy() && packageInfo?.meta?.dependencyDelay) {
      await sleep(parseInt(packageInfo.meta.dependencyDelay));
    }

    if (this.dependencies) {
      await Promise.all(
        Object.entries(this.dependencies).map(async (depNode: [string, DeploymentDependencies]) => {
          const [pkgName, deployDeps] = depNode;
          const priorDepCount = deployDeps.dependencies.length;
          deployDeps.dependencies = deployDeps.dependencies.filter((p) => p.stackName !== packageInfo.stackName && !this.packageDone(p));
          const postDepCount = deployDeps.dependencies.length;
          let pkgCmd = deployDeps.package.getCommand(
            'waiting for dependencies',
          );
          const dependenciesToProcess = deployDeps.dependencies.filter((dep: Package) => {
            return !this.packageDone(dep);
          });
          if (!pkgCmd && dependenciesToProcess?.length) {
            pkgCmd = deployDeps.package.createCmd(
              'waiting for dependencies',
              undefined,
              `waiting for the following dependencies to complete: ${dependenciesToProcess?.map(dep => dep.packageName).join(
                ', ',
              )}\n`);
          }

          if (postDepCount === 0) {
            delete this.dependencies[pkgName];
            pkgCmd?.result(
              0,
              `${packageInfo.stackName} complete... all dependencies now complete`,
            );
          } else if (priorDepCount > postDepCount) {
            if (pkgCmd) {
              pkgCmd.out(
                `${
                  packageInfo.stackName
                } complete... still waiting on: ${this.dependencies[pkgName].dependencies.map(dd => dd.stackName).join(
                  ', ',
                )}`,
              );
            }
          }
        }),
      );
    }

    this.logStatus('processComplete()');
    const finished = await this.start();

    if (finished && this.isDestroy()) {
      const uninstallables = await this.getUninstallables(
        this.options?.packages,
      );
      if (uninstallables?.length === 0) {
        CenvLog.info(`waiting for child processes to finish`);
        this.asyncProcesses.map((p) => CenvLog.info(p, 'child process'));
        await Promise.all(this.asyncProcesses);
        if (this.options?.suite || this.options?.environment) {
          await Cenv.destroyAppConfig(Package.getRootPackageName(), {
            global: true,
            ecr: true,
          });
          await this.uninstallAnythingLeft();
        }
      }
    }
    return finished;

  }

  static getProcessDependencies = (packageInfo) : Package[] => {
    if (this.isDeploy() &&packageInfo?.meta?.service && packageInfo.meta.service.length > 0) {
      return packageInfo.meta.service;
    } else if (this.isDestroy() && packageInfo?.meta?.destroy && packageInfo.meta.destroy.length > 0) {
      return packageInfo.meta.destroy;
    }
  };

  static getDeployDependency(pkg: Package, dep: Package) {
    const dependency = this.isDeploy() ? pkg : dep;
    const reference = this.isDeploy() ? dep : pkg;
    return { dependency, reference };
  }

  static async setDeploymentDependencies(packageInfo: Package) {
    packageInfo.deployDependencies = this.getProcessDependencies(packageInfo);
    if (packageInfo.deployDependencies) {
      await Promise.all(packageInfo.deployDependencies.map(async (d) => {
          const { dependency, reference } = this.getDeployDependency(packageInfo, d);
          if (!this.dependencies[dependency.stackName]) {
            this.dependencies[dependency.stackName] = { package: dependency, dependencies: [reference] };
          }
          this.dependencies[dependency.stackName].dependencies = this.dependencies[dependency.stackName].dependencies.filter((d: Package) => d.stackName !== reference.stackName);
          this.dependencies[dependency.stackName].dependencies.push(reference);
          d.deployDependencies = this.getProcessDependencies(d);
          await this.setDeploymentDependencies(d);
        }),
      );
    }
  }

  static maxProcessing = 4;

  static async start() {

    const packagesToProcess = Object.values(this.toProcess).filter(p => !this.processing.find(processingPkg => processingPkg.packageName === p.packageName));
    const serviceProcesses = packagesToProcess.filter((app: IPackage) => !this.dependencies[app.stackName]?.dependencies?.length);
    const availableToProcess = this.maxProcessing - this.processing.length;
    const availableProcesses = serviceProcesses.slice(0, availableToProcess);
    await Promise.all(
      availableProcesses.map(async (app: Package) => {
        this.processing.push(app);
        delete this.toProcess[app.stackName];
        await this.packageStart(app.stackName, `${this.mode()} ${app.stackName}`);
      }),
    );

    packagesToProcess
      .filter((app: Package) => this.dependencies[app.stackName])
      .map((dockerApp: Package) => {
        if (this.packageDone(dockerApp)) {
        } else if (dockerApp.processStatus !== ProcessStatus.CANCELLED) {
          // dockerApp.processStatus = ProcessStatus.HAS_PREREQS
          dockerApp.statusTime = Date.now();
        }
      });

    //await Promise.all(serviceProcesses);
    this.asyncProcesses = this.asyncProcesses.concat(availableToProcess);
    return (
      Object.keys(this.toProcess).length === 0 &&
      this.processing.length === 0 &&
      (!this?.options?.dependencies ||
        (this?.options?.dependencies &&
          Object.keys(this.dependencies).length === 0))
    );
  }

  static logStatusOutput(title, ctrl) {
    const lines = [`to-process (${Object.keys(this.toProcess).length}): ${Object.keys(this.toProcess).map((p) => p).join(', ')}`];
    lines.push(`processing [${this.processing.length}]`);
    this.processing.map((p: Package) => {
      lines.push(`\t - ${p.stackName}`);
    })
    lines.push(`dependencies [${Object.keys(this.dependencies).length}]`);
    Object.keys(this.dependencies).map((d) => {
      lines.push(`\t - ${d} => ${this.dependencies[d].dependencies.map(d => d.stackName).join(', ')}`);
    });

    if (CenvParams.dashboard) {
      return CenvParams.dashboard.createBox(ctrl, title, [lines.join('\n')], chalk.bgBlue, colors.infoBold);
    } else {
      return lines.join('\n');

    }
  }

  static logStatus(title) {
    //const dashboardInspection = util.inspect(CenvParams.dashboard.createBox);
    //cleanup('kill it son');
    //console.log(dashboardInspection);
    //process.exit(0);
    try {
      let status: any;
      if (CenvParams.dashboard) {
        status = this.logStatusOutput(title, CenvParams.dashboard?.cmdPanel?.stdout);
      } else {
        const ctrl = { width: process.stdout.columns , padding: { left: 1, right: 1 } };
        status = this.logStatusOutput(title, ctrl);
      }

      if (CenvParams.dashboard) {
        CenvLog.single.verboseLog(status, 'GLOBAL');
      }
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }

  static setDeploymentStatuses() {
    const packages = Package.getPackages();
    packages.map((p: Package) => {

      const done = Deployment.packageDone(p);
      if (done) {
        p.setDeployStatus(ProcessStatus.COMPLETED);
      }
      p.deployDependencies?.map((dep: Package) => {
        if (Deployment.toggleDependencies) {
          const depDone = Deployment.packageDone(dep);
          dep.setDeployStatus(depDone ? ProcessStatus.COMPLETED : ProcessStatus.READY);
        } else {
          dep.setDeployStatus(ProcessStatus.SKIPPED);
        }
      })
    });

    const allPackages = Package.getPackages();
    allPackages.map((p: Package) => {
      if (Deployment.toggleDependencies || this.processItems.find(i => i.packageName === p.packageName)) {
        if (this.packageDone(p)) {
          this.setDeployStatus(p, ProcessStatus.COMPLETED);
        } else {
          this.setDeployStatus(p, ProcessStatus.READY);
        }
      } else {
        this.setDeployStatus(p, ProcessStatus.SKIPPED);
      }
    });

    Object.values(this.dependencies).map((depNode: DeploymentDependencies) => {
      if (depNode.package.deployDependencies) {
        const dependenciesToProcess = depNode.package.deployDependencies.filter((dep: Package) => !this.packageDone(dep));
        const hasDependenciesToProcess = !!dependenciesToProcess?.length;
        if (this.packageDone(depNode.package) || !hasDependenciesToProcess) {
          delete this.dependencies[depNode.package.stackName];
        } else {
          if (Deployment.toggleDependencies) {
            if (hasDependenciesToProcess) {
              this.setDeployStatus(depNode.package, ProcessStatus.HAS_PREREQS);
            }
          } else {
            this.setDeployStatus(depNode.package, ProcessStatus.SKIPPED);
          }
        }
      }
    });
  }

  static processItems = [];
  static async processInit(items) {
    if (!Package.global.timer) {
      Package.global.timer = new Timer('GLOBAL', 'seconds', true);
    } else {
      Package.global.timer.reset()
    }
    if (this.isDeploy()) {
      if (this.options?.bump !== 'reset' && !this.options?.skipBuild) {
       // await Promise.all(items.map(async (p: Package) => p.build()))
      }
      if (this.options.bump) {
        await Version.Bump(Package.getPackages(), this.options.bump);
      }
    }

    if (process.env.FAKE_SUCCESS) {
      Package.getPackages().map(p => p.environmentStatus = this.isDeploy() ? EnvironmentStatus.NOT_DEPLOYED : EnvironmentStatus.UP_TO_DATE);
    } else {
      await Promise.allSettled(items.map(async (p: Package) => p.checkStatus(this.options.mode)));
    }

    this.processItems = items;
    await Promise.allSettled(
      items.map(async (i) => {
        i.statusTime = Date.now();
        if (this?.options?.dependencies) {
          await this.setDeploymentDependencies(i);
        }
      }),
    );

    this.setDeploymentStatuses();
    this.logStatus('processInit()');
    await this.start();
  }

  public static cancelDependencies(pkg: Package) {
    try {
      const dependencyKeys = Object.keys(this.dependencies);
      if (dependencyKeys?.length) {
        const cancelledDependencies = [];

        for (let i = 0; i < dependencyKeys?.length ? dependencyKeys.length : 0; i++) {
          const dependencyLinks = this.dependencies[dependencyKeys[i]];
          if (dependencyLinks?.dependencies.find(d => d === pkg)) {
            cancelledDependencies?.push(dependencyKeys[i]);
            if (Package.cache[dependencyKeys[i]]) {
              Package.cache[dependencyKeys[i]].processStatus =
                ProcessStatus.CANCELLED;
              Package.cache[dependencyKeys[i]].statusTime = Date.now();
            }
          }
        }
        cancelledDependencies?.forEach((f) => {
          CenvLog.single.alertLog(`${colors.alertBold(f)} service cancelled because it was depending on ${colors.alertBold(pkg.packageName,)} which failed`, f);
          delete this.toProcess[f];
          this.cancelDependencies(Package.cache[f]);
        });
      }

    } catch (e) {
      CenvLog.single.catchLog(`failed to cancel dependencies for ${pkg.stackName}`);
    }
  }

  static async getPackages(): Promise<Package[]> {
    const packApps = this.options?.applications?.filter((a) => a !== 'GLOBAL');
    const packs = await Promise.all(
      packApps.map(async (a) => {
        if (!Package.cache[a]) {
          return Package.fromPackageName(a);
        }
        return Package.cache[a];
      }),
    );
    return packs;
  }

  static deployDestroyOptions(options) {
    if (
      !options?.parameters &&
      !options?.stack &&
      !options?.docker
    ) {
      options.parameters = true;
      options.stack = true;
      options.docker = true;
    }
    return options;
  }

  static async validateBootstrap() {
    const cmd = PackageCmd.createCmd('cdk bootstrap --validate');
    const stacks = await listStacks(['CREATE_COMPLETE']);

    const bootstrapStack = stacks?.filter((s) => s.StackName === 'CDKToolkit');
    if (bootstrapStack) {
      process.env.BOOTSTRAP_COMPLETE = 'true';
    } else {
      CenvLog.info(`environment ${process.env.ENV} has not been bootstrapped`);
    }
    cmd?.result(0);
  }

  static async startDeployment(packages: Package[], options: any) {
    Deployment.toggleDependencies = !!options.dependencies;
    if (process.env.CENV_LOG_LEVEL === LogLevel.VERBOSE) {
      CenvLog.info(
        `deploy / destroy options ${JSON.stringify(options, null, 2)}`,
      );
    }

    if (packages?.length > 0) {
      if (!Deployment.toggleDependencies) {
        const allPkgs = Package.getPackages();
        allPkgs.map((p: Package) => {
          const found = packages.find(pkg => pkg.stackName === p.stackName)
          if (!found) {
            p.skipUI = true;
          }}
        );
      }
      await this.validateBootstrap();
    }
    PackageCmd.createCmd(this.isDestroy() ? 'global destroy logs' : 'global deploy logs');
    options = Deployment.deployDestroyOptions(options);

    this.options = { ...this.options, ...options };

    if (Object.keys(Package.cache).length === 0) {
      CenvLog.single.alertLog('no packages loaded');
      process.exit();
    }
  }

  static async getUninstallables(packages) {
    const environment = await Environments.getEnvironment(process.env.ENV);

    if (
      !environment.stacks?.length &&
      (this.options.suite || this.options.environment)
    ) {
      packages = [];
    } else if (!this.options?.parameters && packages?.length) {
      packages = packages.map((p: Package) => {
        const stack = environment.stacks.filter(
          (s) => s?.StackName === p?.stackName,
        );
        if (stack?.length === 1) {
          p.stack.summary = stack[0];
          return p;
        } else {
          p.processStatus = ProcessStatus.SKIPPED;
          p.createCmd(`package not deployed`, 0);
          return null;
        }
      });
    }

    return packages;
  }

  static async getApplications(application) {
    let applications = [];
    if (application) {
      applications.push(application);
    } else if (this.options?.applications) {
      applications = this.options?.applications;
    }
    return applications;
  }

  static async destroyEcr(dockerName: string, remaining = false) {
    const repositories = await describeRepositories();
    if (!repositories || !repositories?.length) {
      CenvLog.info(` - no ecr repos / images to destroy`);
      return;
    } else if (remaining) {
      await Promise.all(
        repositories.map(
          async (r) => await deleteRepository(r.repositoryName, true),
        ),
      );
    } else {
      if (repositories.map((r: Repository) => r.repositoryName)?.filter((r) => dockerName === r)?.length) {
        await deleteRepository(dockerName, true);
      }
    }
  }

  static async destroyParameters(
    application = undefined,
    remaining = false,
    global = false,
  ) {
    if (global || remaining) {
      if (global) {
        await deleteParametersByPath('/global', ' -', 'GLOBAL');
        await deleteParametersByPath('/globalenv', ' -', 'GLOBAL');
      }
      if (remaining) {
        await deleteParametersByPath('/service', ' -', 'GLOBAL');
      }
    } else {
      const applications = await this.getApplications(application);
      if (applications?.length) {
        await Promise.all(
          applications.map(async (a) => {
            await deleteParametersByPath(`/service/${stripPath(a)}`,'    -', a);
          }),
        );
      }
    }
  }

  static async destroyConfig(application: string) {
    const applications = await this.getApplications(application);
    if (applications?.length) {
      await Promise.all(
        applications.map(async (a) => {
          await destroyAppConfig(a, true);
        }),
      );
    }
  }

  static async destroyNonStack(pkg, ecr, parameters, config) {
    try {
      if (ecr && pkg.docker?.dockerName) {
        await this.destroyEcr(pkg.docker.dockerName);
      }

      if (parameters) {
        await this.destroyParameters(pkg.packageName);
      }

      if (config) {
        await this.destroyConfig(pkg.packageName);
      }
    } catch (e) {
      return 1;
    }
    return 0;
  }

  static async uninstallAnythingLeft() {
    CenvLog.info('uninstall anything left');
    const options = this.options;
    if (!options) return;

    let removeAll = false;
    if (
      !options?.parameters &&
      !options?.docker &&
      !options?.cenv
    ) {
      removeAll = true;
    }

    if (options?.parameters || removeAll) {
      await destroyRemainingConfigs();
      await this.destroyParameters(undefined, true, true);
    }
    if (options?.docker || removeAll) {
      await this.destroyEcr(undefined, true);
    }
    if (options?.cenv || removeAll) {
      const destroyedAnything = await Cenv.destroyCenv();
      if (destroyedAnything) {
        CenvLog.info(' - cenv components destroyed');
      } else {
        CenvLog.info(' - cenv is not installed');
      }
    }
  }

  static options: any = { strictVersions: false };
  public static async Deploy(packages: Package[] = [], options) {
    try {
      options.mode = ProcessMode.DEPLOY;
      const validInstall = await Cenv.verifyCenv(false);
      if (!validInstall) {
        await Cenv.deployCenv(true);
      }

      //const cmd = PackageCmd.createCmd('deploy logs')
      await this.startDeployment(packages, options);
      await this.processInit(packages);
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }

  static async Destroy(packages: Package[] = [], options) {
    try {
      options.mode = ProcessMode.DESTROY;
      await this.startDeployment(packages, options);
      const uninstallables = await this.getUninstallables(packages);

      if (packages?.length) {
        await this.processInit(uninstallables?.length ? uninstallables : packages);
      }
    } catch (e) {
      CenvLog.single.catchLog(
        `uninstall failed: ${e.message}\n${e}\n${e.stack}`,
      );
    }
  }
}
