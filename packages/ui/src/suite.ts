import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { CenvLog, getMonoRoot, EnvironmentStatus, Package, ProcessStatus } from '@stoked-cenv/cenv-lib';
import { Environment } from './environment';

export class Suites {
  static data: any;
  static cache: Suite[] = [];

  static hasPackage(packageName) : string[] {
    const suitesJson = Suite.readSuites();
    if (Object.keys(suitesJson)?.length) {
      const suites = Object.keys(suitesJson).filter(k => {
        return suitesJson[k].packages.indexOf(packageName) > -1;
      });
      return suites;
    }
  };
}

export class Suite {

  name: string;
  packages: Package[];
  packageNames: string[];
  environment: Environment = undefined;

  constructor(name) {
    this.name = name;
    const suite = Suite.getSuite(name);
    this.packageNames = suite.packages;
    if (this.packageNames?.length) {
      this.packages = this.packageNames.map((pn: string) => {
        return Package.fromPackageName(pn)
      });
    }
  }
  static load(name) {
    if (Suites.cache[name]) {
      return Suites.cache[name]
    }
    const suite = new Suite(name);
    Suites.cache[name] = suite;
    return suite;
  }

  async getDeployment() {
    this.environment = new Environment();
    await this.environment.getStacks();
    const deployed: Package[] = [];
    const undeployed: Package[] = []
    this.packages = this.packages.map((p: Package) => {
      const stack = this.environment?.stacks.filter(s => s?.StackName === p?.stackName);
      if (stack?.length === 1) {
        p.deploy.detail = stack[0];
        p.environmentStatus = EnvironmentStatus.UP_TO_DATE;
        p.processStatus = ProcessStatus.COMPLETED;
        return p;
      } else {
        p.environmentStatus = EnvironmentStatus.NOT_DEPLOYED;
        p.createCmd(`package not deployed`, 0);
        return p;
      }
    })
    return { deployed, undeployed };
  }

  static isSuite(suite) {
    return !!this.getSuite(suite);
  }

  static getSuite(suite) {
    if (Suites.data)
      return Suites.data[suite];
    Suite.readSuites();
    return Suites.data[suite];
  }

  static suitePath() {
    const rootPath = getMonoRoot();
    return path.join(rootPath, 'suites.json');
  }

  static readSuites() {
    if (Suites.data) {
      return Suites.data;
    }
    const suitesPath = this.suitePath();
    if (!existsSync(suitesPath)) {
      CenvLog.single.errorLog(`the suites file ${suitesPath} could not be parsed`)
      return;
    }
    const suites: any = readFileSync(suitesPath, 'utf-8');
    if (!suites) {
      return;
    }
    Suites.data = JSON.parse(suites);
    return Suites.data;
  }
}
