import {CenvLog} from './log';
import {Package} from './package/package';
import {describeStacks, listStacks} from './aws/cloudformation'
import {Suite} from './suite';
import {StackSummary, Stack } from '@aws-sdk/client-cloudformation';
import { CenvFiles } from './file';
import {semVerParse} from "./utils";
import {StackModule} from "./package/stack";

export class Environments {
  static cache: { [environmentName: string]: Environment } = {};

  static async getEnvironment(environmentName: string) {
    if (this.cache[environmentName]) {
      return this.cache[environmentName];
    }
    const env = new Environment({environment: environmentName});
    await env.getStacks();
    return env;
  }
}

interface StackInfo { summary: StackSummary, stack: Stack, stackName: string, package: Package }

export class Environment {
  name: string;
  suite?: Suite;
  packages: Package[] = [];
  stacks: StackInfo[] = [];

  constructor(options?: { environment?: string, suite?: Suite }) {
    this.name = options?.environment || CenvFiles.ENVIRONMENT;
    this.suite = options?.suite;
  }

  static async fromName(environment: string): Promise<Environment> {
    const env = new Environment({environment});
    await env.load();
    return env;
  }

  static async getStacks(environment: string): Promise<StackInfo[]> {
    const existingStacks: any = await listStacks([
      'CREATE_COMPLETE',
      'ROLLBACK_COMPLETE',
      'UPDATE_COMPLETE',
      'CREATE_IN_PROGRESS',
      'DELETE_IN_PROGRESS',
      'DELETE_FAILED',
      'UPDATE_ROLLBACK_COMPLETE'
    ]);

    const filtered = existingStacks.filter((s: any) => s.StackName.startsWith(environment + '-'));
    const results: [] = [];
    for(const s of filtered) {
      const res: any = { summary: s };
      const stacks = await describeStacks(s.StackName, true);
      if (stacks && stacks.length) {
        res.detail = stacks[0];
        const packageName = StackModule.getTag(stacks[0], 'CENV_APPLICATION_NAME');
        const version = StackModule.getTag(stacks[0], 'CENV_PKG_VERSION');
        if (packageName) {
          res.convertedStack = Package.packageNameToStackName(packageName);
          res.package = Package.cache[res.convertedStack];
          if (!Package.cache[res.convertedStack]) {
            res.package = new Package(packageName);
          }
        }
      }
    }
    return results;
  }

  async load() {
    this.stacks = await Environment.getStacks(this.name)

    this.packages = this.stacks.map((s) => {
      console.log(JSON.stringify(s, null, 2));
      return Package.fromStackName(s.stackName as string)
    }).filter(p => !!p);

    this.stacks.map((s) => {
      const pkg = Package.fromStackName(s.stackName as string);
      if (pkg.stack) {
        pkg.stack.summary = s.summary;
        pkg.stack.detail = s.stack;
      }
      this.packages.push(pkg);
      return pkg;
    });
    if (this.packages?.length) {
      //Environments[this.name] = this;
    }
  }

  async getStacks(): Promise<StackInfo[]> {
    this.stacks = (await Environment.getStacks(this.name)).filter(s => s.stackName ? s.stackName.startsWith(this.name + '-') : false);
    return this.stacks;
  }
}
