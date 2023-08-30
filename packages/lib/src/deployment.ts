import { Environments } from './environment';
import { Cenv } from './cenv';
import { EnvironmentStatus, IPackage, Package, ProcessStatus } from './package/package';
import { getOs, isOsSupported, simplify, sleep } from './utils';

import Fake from './fake';
import { ProcessMode } from './package/module';
import { CenvLog, LogLevel } from './log';
import { Version } from './version';
import { listStacks } from './aws/cloudformation';
import { ParamsModule } from './package/params';
import { DockerModule } from './package/docker';
import { StackSummary } from '@aws-sdk/client-cloudformation';
import { execCmd, ICmdOptions } from './proc';
import { CenvParams } from './params';
import { CenvFiles } from './file';

interface DeploymentDependencies {
  package: Package;
  dependencies: Package[];
}

export class Deployment {
  static toggleDependencies = false;
  static asyncProcesses: any[] = [];
  static toProcess: { [key: string]: Package } = {};
  static dependencies: { [key: string]: DeploymentDependencies } = {};
  static processing: Package[] = [];
  static completed: any[] = [];
  static maxProcessing?: number = process.env.CENV_MAX_PROCESSING ? parseInt(process.env.CENV_MAX_PROCESSING) : undefined;
  static processItems: any[] = [];
  static options: any = { strictVersions: false };

  static removeDependency(pkg: Package) {
    pkg.deployDependencies?.map(dep => {
      const { dependency, reference } = this.getDeployDependency(pkg, dep);
      if (this.dependencies[dependency.stackName]) {
        this.dependencies[dependency.stackName].dependencies = this.dependencies[dependency.stackName]?.dependencies.filter(deployDep => deployDep.packageName !== reference.packageName);
        if (!this.dependencies[dependency.stackName]?.dependencies.length) {
          delete this.dependencies[dependency.stackName];
        }
      }
    });
  }

  static stopProcessing(pkg: Package) {
    this.processing = this.processing.filter((p: Package) => pkg != p);
    delete this.toProcess[pkg.stackName];
  }

  static addDependency(pkg: Package) {
    if (!Deployment.toggleDependencies) {
      return;
    }
    //console.log('\tadd dependency', pkg.packageName);
    Package.getPackages().find((p: Package) => p.deployDependencies?.find((dep: Package) => {
      if (dep.packageName === pkg.packageName) {
        const deployDependency = this.getDeployDependency(p, pkg);
        if (this.dependencies[deployDependency.dependency.stackName]) {
          this.dependencies[deployDependency.dependency.stackName].dependencies = this.dependencies[deployDependency.dependency.stackName].dependencies.filter(dep => dep.packageName !== deployDependency.reference.packageName);
          this.dependencies[deployDependency.dependency.stackName].dependencies.push(deployDependency.reference);
        } else {
          this.dependencies[deployDependency.dependency.stackName] = {
            package: deployDependency.dependency, dependencies: [deployDependency.reference],
          };
        }
      }
    }));
  }

  static setDeployStatus(pkg: Package, status: ProcessStatus) {
    pkg.processStatus = status;
    switch (status) {
      case ProcessStatus.COMPLETED:
        this.removeDependency(pkg);
      // eslint-disable-next-line no-fallthrough
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

  static async handleFake(pkg: Package): Promise<boolean> {
    if (process.env.FAKE_SUCCESS) {
      if (pkg.environmentStatus === EnvironmentStatus.UP_TO_DATE || pkg.environmentStatus === EnvironmentStatus.NOT_DEPLOYED) {
        return true;
      }
      await Fake.success(pkg);
      pkg.environmentStatus = this.isDeploy() ? EnvironmentStatus.UP_TO_DATE : EnvironmentStatus.NOT_DEPLOYED;
      return true;
    }
    return false;
  }

  static async cmd(pkg: Package, name: string, options: ICmdOptions = {
    envVars: {}, cenvVars: {}, detached: false, waitSeconds: 0, waitForOutput: undefined, stdio: 'inherit', getCenvVars: false,
  }) {
    try {

      if (await this.handleFake(pkg)) {
        return true;
      }

      if (this.isDeploy()) {
        await pkg.deploy(this.options);
        await pkg.checkStatus(ProcessMode.DEPLOY.toString(), pkg.processStatus);
      } else {
        if (pkg.meta.data.destroyStack) {
          const res = await pkg.pkgCmd(pkg.meta.data.destroyStack);
          await pkg.checkStatus(ProcessMode.DESTROY.toString(), pkg.processStatus);
          return false;
        }
        await pkg.destroy(this.options);
        await pkg.checkStatus(ProcessMode.DESTROY.toString(), pkg.processStatus);
      }
      return true;
    } catch (e) {

      if (e instanceof Number || (e instanceof String && !Number.isNaN(Number(e)))) {
        CenvLog.single.errorLog(`Cmd() returned a non 0 return value.. ${e}`, pkg.stackName, true);
      } else if (e instanceof Error) {
        CenvLog.single.errorLog(e.stack ? e.stack : e.toString(), pkg.stackName, true);
      } else {
        CenvLog.single.errorLog(`${e} not sure what this exception type is`, pkg.stackName, true);
      }
      Deployment.cancelDependencies(pkg);
      this.setDeployStatus(pkg, ProcessStatus.FAILED);
      return false;
    }
  }

  static async packageStart(pkg: Package, message: string, envVars: any = {}) {
    try {
      pkg.timer?.start();

      if (pkg.processStatus === ProcessStatus.HAS_PREREQS && pkg?.cmds?.length > 0) {
        pkg.cmds[0].code = 0;
      }
      pkg.statusTime = Date.now();

      if (pkg.isGlobal) {
        return;
      }
      //this.setDeployStatus(pkg, ProcessStatus.PROCESSING);

      const processRes = await this.cmd(pkg, message, {
        envVars, getCenvVars: this.isDestroy() ? false : pkg.params?.hasCenvVars,
      });

      const complete = await this.packageComplete(pkg, processRes ? ProcessStatus.COMPLETED : ProcessStatus.FAILED);
      if (complete) {
        Package.global.timer?.stop();
      }
    } catch (e) {
      CenvLog.single.catchLog(new Error(pkg.packageName + ': ' + e));
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
    if (this.options.force) {
      return false;
    }
    switch (pkg.environmentStatus) {
      case EnvironmentStatus.UP_TO_DATE:
        if (this.isDeploy()) {
          return true;
        }
        break;
      case EnvironmentStatus.NOT_DEPLOYED:
        if (this.isDestroy()) {
          return true;
        }
        break;
    }

    return false;
  }

  static processDone(pkg: Package) {
    switch (pkg.processStatus) {
      case ProcessStatus.COMPLETED:
      case ProcessStatus.FAILED:
      case ProcessStatus.CANCELLED:
        return true;
    }
    return false;
  }

  static async packageComplete(packageInfo: Package, processStatus?: ProcessStatus) {

    packageInfo.setDeployStatus(processStatus !== undefined ? processStatus : ProcessStatus.COMPLETED);
    packageInfo.statusTime = Date.now();
    packageInfo.timer?.stop();

    if (this.options.bump) {
      await packageInfo.bumpComplete();
    }

    this.processing = this.processing.filter((p) => p.stackName !== packageInfo.stackName);
    this.completed.push(packageInfo);

    if (this.isDeploy() && packageInfo?.meta?.data.dependencyDelay) {
      await sleep(parseInt(packageInfo.meta.data.dependencyDelay));
    }

    if (this.dependencies) {
      await Promise.all(Object.entries(this.dependencies).map(async (depNode: [string, DeploymentDependencies]) => {
        const [pkgName, deployDeps] = depNode;
        const priorDepCount = deployDeps.dependencies.length;
        deployDeps.dependencies = deployDeps.dependencies.filter((p) => p.stackName !== packageInfo.stackName && !this.packageDone(p));
        const postDepCount = deployDeps.dependencies.length;

        const dependenciesToProcess = deployDeps.dependencies.filter((dep: Package) => {
          return !this.packageDone(dep);
        });

        if (postDepCount === 0) {
          delete this.dependencies[pkgName];
        }
      }));
    }

    this.logStatus('processComplete()');
    const finished = await this.start();

    if (finished && this.isDestroy()) {
      const uninstallables = await this.getUninstallables(this.options?.packages);
      if (uninstallables?.length === 0) {
        CenvLog.info(`waiting for child processes to finish`);
        this.asyncProcesses.map((p) => CenvLog.info(p, 'child process'));
        await Promise.all(this.asyncProcesses);
        if (this.options?.suite || this.options?.environment) {
          await CenvParams.destroyAppConfig(Package.getRootPackageName(), {
            global: true, ecr: true,
          });
          await this.uninstallAnythingLeft();
        }
      }
    }
    return finished;

  }

  static getProcessDependencies = (packageInfo: Package): Package[] => {
    if (this.isDeploy() && packageInfo?.meta?.data.deployDependencies && packageInfo.meta.data.deployDependencies.length > 0) {
      return packageInfo.meta.data.deployDependencies;
    } else if (this.isDestroy() && packageInfo?.meta?.data.destroyDependencies && packageInfo.meta.data.destroyDependencies.length > 0) {
      return packageInfo.meta.data.destroyDependencies;
    }
    return [];
  };

  static getDeployDependency(pkg: Package, dep: Package) {
    const dependency = this.isDeploy() ? pkg : dep;
    const reference = this.isDeploy() ? dep : pkg;
    return { dependency, reference };
  }

  static setDeploymentDependencies(packageInfo: Package) {
    packageInfo.deployDependencies = this.getProcessDependencies(packageInfo);
    if (packageInfo.deployDependencies?.length) {
      //console.log('\n\n', packageInfo.packageName, 'deployDependencies', packageInfo.deployDependencies.map(d => d.packageName).join(', '));
      packageInfo.deployDependencies.map((d) => {
        const { dependency, reference } = this.getDeployDependency(packageInfo, d);
        if (!this.dependencies[dependency.stackName]) {
          this.dependencies[dependency.stackName] = { package: dependency, dependencies: [reference] };
        }

        this.dependencies[dependency.stackName].dependencies = this.dependencies[dependency.stackName].dependencies.filter((d: Package) => d.stackName !== reference.stackName);
        this.dependencies[dependency.stackName].dependencies.push(reference);
        //console.log('set dependency', dependency.stackName, '=>', reference.stackName);
        //console.log('dependencies', this.dependencies[dependency.stackName].dependencies?.length);
        d.deployDependencies = this.getProcessDependencies(d);
        //console.log('dependencies', this.dependencies[dependency.stackName].dependencies?.length);
        this.setDeploymentDependencies(d);
        //console.log('dependencies', this.dependencies[dependency.stackName].dependencies?.length);

      });
    }
  }

  static async start() {
    try {
      const toProcessVals = Object.values(this.toProcess);
      const toProcessKeys = Object.keys(this.toProcess);
      const packagesToProcess = toProcessVals.filter(p => !this.processing.find(processingPkg => processingPkg.packageName === p.packageName));
      const serviceProcesses = packagesToProcess.filter((app: IPackage) => !this.dependencies[app.stackName]?.dependencies?.length);
      const availableToProcess = this.maxProcessing ? this.maxProcessing - this.processing.length : serviceProcesses.length;
      const availableProcesses = serviceProcesses.slice(0, availableToProcess);
      await Promise.all(availableProcesses.map(async (app: Package) => {
        this.processing.push(app);
        delete this.toProcess[app.stackName];
        if (!Package.global.timer?.running) {
          Package.global.timer?.start();
        }
        await this.packageStart(Package.fromStackName(app.stackName), `${this.mode()} ${app.stackName}`);
      }));
      packagesToProcess
      .filter((app: Package) => this.dependencies[app.stackName])
      .map((pkg: Package) => {
        if (this.packageDone(pkg)) {
          // TODO: what is this? why is this that way..
        } else if (pkg.processStatus !== ProcessStatus.CANCELLED) {
          pkg.processStatus = ProcessStatus.HAS_PREREQS;
          pkg.statusTime = Date.now();
        }
      });

      //await Promise.all(serviceProcesses);
      this.asyncProcesses = this.asyncProcesses.concat(availableToProcess);
      return (Object.keys(this.toProcess).length === 0 && this.processing.length === 0 && (!this?.options?.dependencies || (this?.options?.dependencies && Object.keys(this.dependencies).length === 0)));
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }

  static logStatusOutput(title: string, ctrl: any) {
    const lines = [`to-process (${Object.keys(this.toProcess).length}): ${Object.keys(this.toProcess).map((p) => p).join(', ')}`];
    lines.push(`processing [${this.processing.length}]`);
    this.processing.map((p: Package) => {
      lines.push(`\t - ${p.stackName}`);
    });
    lines.push(`dependencies [${Object.keys(this.dependencies).length}]`);
    Object.keys(this.dependencies).map((d) => {
      lines.push(`\t - ${d} => ${this.dependencies[d].dependencies.map(d => d.stackName).join(', ')}`);
    });

    if (Cenv.dashboard) {
      return Cenv.dashboard.createBox(ctrl, title, [lines.join('\n')], CenvLog.colors.smoothBg, CenvLog.colors.infoBold);
    } else {
      return lines.join('\n');

    }
  }

  static logStatus(title: string) {
    //const dashboardInspection = util.inspect(Cenv.dashboard.createBox);
    //cleanup('kill it son');
    //console.log(dashboardInspection);
    //process.exit(0);
    try {
      let status: any;
      if (Cenv.dashboard) {
        status = this.logStatusOutput(title, Cenv.dashboard?.cmdPanel?.stdout);
      } else {
        const ctrl = { width: process.stdout.columns, padding: { left: 1, right: 1 } };
        status = this.logStatusOutput(title, ctrl);
      }

      if (Cenv.dashboard) {
        CenvLog.single.verboseLog(status, 'GLOBAL');
      }
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }

  static setDeploymentStatuses() {
    const packages = Package.getPackages();
    packages.map((p: Package) => {
      const done = Deployment.processDone(p);
      if (done) {
        p.setDeployStatus(ProcessStatus.COMPLETED);
      }
      p.deployDependencies?.map((dep: Package) => {
        if (Deployment.toggleDependencies) {
          const depDone = Deployment.packageDone(dep);
          dep.setDeployStatus(depDone ? ProcessStatus.COMPLETED : ProcessStatus.READY);
        }
      });
    });
    //console.log('this.dependencies 2', Object.keys(this.dependencies).join(', '), 'references', Object.values(this.dependencies).map(d =>
    // d.dependencies.map(d => `${d.stackName}:${d.processStatus}`)).join(', '));

    const allPackages = Package.getPackages();
    allPackages.map((p: Package) => {
      if (Deployment.toggleDependencies || this.processItems.find(i => i.packageName === p.packageName)) {
        if (this.packageDone(p)) {
          this.setDeployStatus(p, ProcessStatus.COMPLETED);
        } else {
          this.setDeployStatus(p, ProcessStatus.READY);
        }
      }
    });

    //console.log('this.dependencies 3', Object.keys(this.dependencies).join(', '), 'references', Object.values(this.dependencies).map(d =>
    // d.dependencies.map(d => `${d.stackName}:${d.processStatus}`)).join(', '));

    Object.values(this.dependencies).map((depNode: DeploymentDependencies) => {
      if (depNode.dependencies) {
        //console.log(depNode.package.packageName, '.deployDependencies', depNode.dependencies.length);
        const dependenciesToProcess = depNode.dependencies.filter((dep: Package) => !this.processDone(dep));
        const hasDependenciesToProcess = !!dependenciesToProcess?.length;
        //console.log('hasDependenciesToProcess', hasDependenciesToProcess);
        if (this.processDone(depNode.package) || !hasDependenciesToProcess) {
          delete this.dependencies[depNode.package.stackName];
        } else if (Deployment.toggleDependencies && hasDependenciesToProcess) {
          this.setDeployStatus(depNode.package, ProcessStatus.HAS_PREREQS);
        }
      }
    });
  }

  static sysInfo() {
    const info = getOs();
    for (const [key, value] of Object.entries(info)) {
      CenvLog.info(key, value, '[GLOBAL]');
    }
  }

  static async processInit(items: Package[]) {
    try {
      this.sysInfo();

      if (this.options.docker) {
        await DockerModule.dockerPrefight(items);
      }

      if (this.isDeploy()) {
        if (this.options?.bump !== 'reset' && !this.options?.skipBuild) {
         // await Promise.all(items.map(async (p: Package) => await p?.lib?.build()));
        }
        if (this.options.bump) {
          //await Version.Bump(Package.getPackages(), this.options.bump);
        }
      }

      if (process.env.FAKE_SUCCESS) {
        Package.getPackages().map(p => p.environmentStatus = this.isDeploy() ? EnvironmentStatus.NOT_DEPLOYED : EnvironmentStatus.UP_TO_DATE);
      } else {
        await Promise.allSettled(items.map(async (p: Package) => p.checkStatus(this.options.mode)));
      }
      this.processItems = items;
      if (process.env.CENV_PROCESS_TEST) {
        Package.getPackages().map(p => p.environmentStatus = this.isDeploy() ? EnvironmentStatus.NOT_DEPLOYED : EnvironmentStatus.UP_TO_DATE);
      }
      items.map(async (i) => {
        i.statusTime = Date.now();
        if (this?.options?.dependencies) {
          this.setDeploymentDependencies(i);
          //console.log(i.packageName,'dependencies', i.deployDependencies?.map(d => d.packageName).join(', '));
        }
      });
      //console.log('this.dependencies 1', Object.keys(this.dependencies).join(', '), 'references', Object.values(this.dependencies).map(d =>
      // d.dependencies.map(d => `${d.stackName}:${d.processStatus}`)).join(', '));

      this.setDeploymentStatuses();
      //console.log('this.dependencies after', Object.keys(this.dependencies).join(', '), 'references', Object.values(this.dependencies).map(d =>
      // d.dependencies.map(d => `${d.stackName}:${d.processStatus}`)).join(', '));

      Package.getPackages().map(p => {
        if (p.processStatus === ProcessStatus.INITIALIZING) {
          p.checkStatus(this.options.mode, ProcessStatus.SKIPPED)
        }});
      this.logStatus('processInit()');
      await this.start();
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }

  public static cancelDependencies(pkg: Package) {
    try {
      const dependencyKeys = Object.keys(this.dependencies);
      if (dependencyKeys?.length) {
        const cancelledDependencies = new Set<string>();
        for (let i = 0; i < dependencyKeys?.length ? dependencyKeys.length : 0; i++) {
          const dependencyLinks = this.dependencies[dependencyKeys[i]];
          if (dependencyLinks?.dependencies.find(d => d === pkg)) {
            const pkgName = dependencyKeys[i];
            const dependencyPkg = Package.fromStackName(pkgName);
            if (dependencyPkg && dependencyPkg.processStatus !== ProcessStatus.CANCELLED) {
              cancelledDependencies?.add(pkgName);
              dependencyPkg.processStatus = ProcessStatus.CANCELLED;
              dependencyPkg.statusTime = Date.now();
            }
          }
        }
        cancelledDependencies?.forEach((f) => {
          CenvLog.single.alertLog(`${CenvLog.colors.alertBold(f)} service cancelled because it was depending on ${CenvLog.colors.alertBold(pkg.packageName)} which failed`, f);
          delete this.toProcess[f];
          this.cancelDependencies(Package.fromStackName(f));
        });
      }

    } catch (e) {
      CenvLog.single.catchLog(`failed to cancel dependencies for ${pkg.stackName}`);
    }
  }

  static async getPackages(): Promise<Package[]> {
    const packApps = this.options?.applications?.filter((a: string) => a !== 'GLOBAL');
    const packs = await Promise.all(packApps.map(async (a: string) => {
      return Package.fromPackageName(a);
    }));
    return packs;
  }

  static deployDestroyOptions(options: any) {
    if (!options.lib && !options.exec && !options?.parameters && !options?.stack && !options?.docker && !options?.none) {
      options.parameters = true;
      options.stack = true;
      options.docker = true;
      options.lib = true;
      options.exec = true;
    }
    return options;
  }

  static async validateBootstrap() {
    const cmd = Package.global.createCmd('cdk bootstrap --validate');
    const stacks = await listStacks(['CREATE_COMPLETE']);

    const bootstrapStack = stacks?.filter((s) => s.StackName === 'CDKToolkit');
    if (!(bootstrapStack?.length)) {
      CenvLog.info(`environment ${CenvFiles.ENVIRONMENT} has not been bootstrapped`);
      await execCmd(`cdk bootstrap aws://${process.env.CDK_DEFAULT_ACCOUNT}/${process.env.AWS_REGION}`);
    }
    cmd?.result(0);
  }

  static async startDeployment(packages: Package[], options: any) {
    Deployment.toggleDependencies = !!options.dependencies;

    if (packages?.length > 0) {
      if (!Deployment.toggleDependencies) {
        const allPkgs = Package.getPackages();
        allPkgs.map((p: Package) => {
          const found = packages.find(pkg => pkg.stackName === p.stackName);
          if (!found) {
            //p.skipUI = true;
          }
        });
      }
      await this.validateBootstrap();
    }
    options = Deployment.deployDestroyOptions(options);

    this.options = { ...this.options, ...options };
    if (Object.keys(Package.getPackages()).length === 0) {
      CenvLog.single.alertLog('no packages loaded');
      process.exit();
    }
  }

  static async getUninstallables(packages: Package[]) {
    const environment = await Environments.getEnvironment(CenvFiles.ENVIRONMENT);

    if (!environment.stacks?.length && (this.options.suite || this.options.environment)) {
      packages = [];
    } else if (!this.options?.parameters && packages?.length) {
      packages = packages.filter((p: Package) => {
        const stack = environment.stacks.filter((s) => s?.summary.StackName === p?.stackName);
        if (stack?.length === 1 && p.stack) {
          p.stack.summary = stack[0].summary as StackSummary;
          return true;
        }
        return false;
      });
    }

    return packages;
  }

  static async uninstallAnythingLeft() {
    CenvLog.info('uninstall anything left');
    const options = this.options;
    if (!options) {
      return;
    }

    let removeAll = false;
    if (!options?.parameters && !options?.docker && !options?.cenv) {
      removeAll = true;
    }

    if (options?.parameters || removeAll) {
      await ParamsModule.destroyAllConfigs();
      await ParamsModule.destroyAllParams();
    }

    if (options?.docker || removeAll) {
      await DockerModule.destroyAll();
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

  public static async Deploy(packages: Package[] = [], options: any) {
    try {
      Cenv.dashboard?.debug('deploy:', packages.map((p: Package) => p.packageName).join(', '));
      options.mode = ProcessMode.DEPLOY;
      this.options.mode = options.mode;
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

  static async Destroy(packages: Package[] | undefined = [], options: any) {
    try {
      options.mode = ProcessMode.DESTROY;
      this.options.mode = options.mode;
      await this.startDeployment(packages, options);
      const uninstallables = await this.getUninstallables(packages);
      if (packages?.length) {
        await this.processInit(uninstallables?.length ? uninstallables : packages);
      }
    } catch (e) {
      if (e instanceof Error) {
        CenvLog.single.catchLog(`uninstall failed: ${e.message}\n${e}\n${e.stack}`);
      }
    }
  }
}
