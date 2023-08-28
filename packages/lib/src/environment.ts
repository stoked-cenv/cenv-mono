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
interface PackageInfo { [packageName: string]: Package[] }

export class Environment {
  name: string;
  suite?: Suite;
  packages: PackageInfo = {};
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
    const existingStacks: any = await listStacks(['CREATE_COMPLETE', 'ROLLBACK_COMPLETE', 'UPDATE_COMPLETE', 'CREATE_IN_PROGRESS', 'DELETE_IN_PROGRESS', 'DELETE_FAILED', 'UPDATE_ROLLBACK_COMPLETE']);

    return existingStacks.filter((s: any) => {
      return s.StackName.startsWith(environment + '-');
    })
  }

  static async getStackInfos(environment: string): Promise<StackInfo[]> {
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
    const results: StackInfo[] = [];
    for(const s of filtered) {
      const res: any = { summary: s };
      const stacks = await describeStacks(s.StackName, true);
      if (stacks && stacks.length) {
        res.detail = stacks[0];
        const packageName = StackModule.getTag(stacks[0], 'CENV_APPLICATION_NAME');
        const version = StackModule.getTag(stacks[0], 'CENV_PKG_VERSION');
        if (packageName) {
          res.stackName = Package.packageNameToStackName(packageName);
          res.package = Package.cache[res.stackName];
          if (!Package.cache[res.stackName]) {
            res.package = new Package(packageName);
            res.package.stack.summary = s.summary;
            res.package.stack.detail = s.detail;
          }
        }
        results.push(res);
      }
    }
    return results;
  }

  async load() {
    this.stacks = await Environment.getStackInfos(this.name)
    this.stacks.map((s) => {
      if (s.package) {
        if (!this.packages[s.package.packageName]) {
          this.packages[s.package.packageName] = [];
        }
        this.packages[s.package.packageName].push(s.package);
      }
    });
  }

  async getStacks(): Promise<StackInfo[]> {
    this.stacks = (await Environment.getStacks(this.name)).filter(s => s.stackName ? s.stackName.startsWith(this.name + '-') : false);
    return this.stacks;
  }
}
