import { Dashboard } from './dashboard'
import { Environment } from '../environment';
import { Suite, Suites } from '../suite';
import { CenvParams, Package } from '@stoked-cenv/cenv-lib';
import {Deployment, DeploymentMode} from '../deployment';

export class CenvUI {
  dashboard: Dashboard;
  environment?: Environment;
  suite?: Suite;
  packages: Package[];
  cmd?: DeploymentMode;

  constructor(cmdOptions, packages, cmd?: DeploymentMode) {
    this.cmd = cmd;
    this.packages = packages;
    this.suite = Suites.cache && Object.values(Suites.cache)?.length ? Object.values(Suites.cache)[0] : undefined;
    this.environment = cmdOptions.environment;
    Deployment.options.skipBuild = true;
    this.dashboard = new Dashboard({
      packages: this.packages,
      suite: this.suite,
      environment: this.environment,
      cmd: this.cmd
    }, cmdOptions);
  }

}
