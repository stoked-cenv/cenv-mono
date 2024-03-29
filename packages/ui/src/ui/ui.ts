import {Deployment, Environment, Package, ProcessMode, Suite, Suites} from '@stoked-cenv/lib';

export class CenvUI {
  environment?: Environment;
  suite?: Suite;
  packages: Package[];
  cmd?: ProcessMode;

  constructor(cmdOptions: any, packages: Package[], cmd?: ProcessMode) {
    this.cmd = cmd;
    this.packages = packages;
    this.suite = Suites.cache && Object.values(Suites.cache)?.length ? Object.values(Suites.cache)[0] : undefined;
    this.environment = cmdOptions.environment;
    Deployment.options.skipBuild = true;
  }
}
