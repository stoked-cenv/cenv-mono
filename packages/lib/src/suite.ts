import * as path from 'path';
import {existsSync, readFileSync} from 'fs';
import {Environment} from './environment';
import {EnvironmentStatus, Package, ProcessStatus} from "./package/package";
import {getMonoRoot} from "./utils";
import {Cenv} from "./cenv";

export class Suites {
  static data: any;
  static cache: Suite[] = [];

  static hasPackage(packageName: string): boolean {
    const suitesJson = Suite.readSuites();
    if (Object.keys(suitesJson)?.length) {
      const pkg = Object.keys(suitesJson).filter(k => {
        return suitesJson[k].packages.find(packageName);
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
    Suite.readSuites();

    if (Suites?.data && Suites.data[suite]) {
      return new Suite(Suites.data[suite]);
    }
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
