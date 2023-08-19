import * as path from 'path';
import { existsSync } from 'fs';
import { Package } from './package/package';
import { CenvFiles } from './file';
import { Cenv } from './cenv';

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
        return Package.fromPackageName(pn);
      });
    }
  }

  static get defaultSuite() {
    if (Cenv.defaultSuite) {
      return 'default';
    }
    return Cenv.defaultSuite;
  }

  static load(name: any) {
    if (Suites.cache[name]) {
      return Suites.cache[name];
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
    const rootPath = CenvFiles.getGuaranteedMonoRoot();
    const suitePath = path.join(rootPath, 'suites.json');
    return existsSync(suitePath) ? suitePath : false;
  }
}
