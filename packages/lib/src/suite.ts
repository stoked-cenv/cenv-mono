import * as path from 'path';
import {existsSync, readFileSync} from 'fs';
import {Environment} from './environment';
import {EnvironmentStatus, Package, ProcessStatus} from "./package/package";
import { getGuaranteedMonoRoot, getMonoRoot } from './utils';
import {Cenv} from "./cenv";
import { CenvLog } from './log';

export class Suites {
  static data: any;
  static cache: Suite[] = [];

  static hasPackage(packageName: string): boolean {
    if (Cenv.suites && Object.keys(Cenv.suites)?.length) {
      const pkg = Object.keys(Cenv.suites).filter(k => {
        return Cenv.suites[k].packages.find(packageName);
      });
      return !!pkg;
    }
    return false;
  }
}

export class Suite {

  name: string;
  packages: Package[] = [];
  packageNames: string[];

  constructor(name: string) {
    this.name = name;
    const suite = Suite.getSuite(name);
    this.packageNames = suite.packages;
    if (this.packageNames?.length) {
      this.packages = this.packageNames.map((pn: string) => {
        return Package.fromPackageName(pn)
      });
    }
  }

  static load(name: any) {
    if (Suites.cache[name]) {
      return Suites.cache[name]
    }
    const suite = new Suite(name);
    Suites.cache[name] = suite;
    return suite;
  }

  static isSuite(suite: string) {
    return !!this.getSuite(suite);
  }

  static getSuite(suite: string): any {
    Suites.data = Cenv.suites;
    if (Suites.data) {
      return Suites.data[suite];
    }


    if (Cenv.suites && Cenv.suites[suite]) {
      return new Suite(Cenv.suites[suite]);
    }
  }

  static suitePath() {
    const rootPath = getGuaranteedMonoRoot();
    const suitePath = path.join(rootPath, 'suites.json');
    return existsSync(suitePath) ? suitePath : false;
  }
}
