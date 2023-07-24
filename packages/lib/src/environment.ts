import {CenvLog} from './log';
import {Package} from './package/package';
import {listStacks} from './aws/cloudformation'
import {Suite} from './suite';
import {StackSummary} from '@aws-sdk/client-cloudformation';

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

export class Environment {
  name: string;
  suite?: Suite;
  packages: Package[] = [];
  stacks: StackSummary[] = [];

  constructor(options?: { environment?: string, suite?: Suite }) {
    this.name = options?.environment || process.env.ENV!;
    this.suite = options?.suite;
  }

  static async fromName(environment: string): Promise<Environment> {
    const env = new Environment({environment});
    await env.load();
    return env;
  }

  static async getStacks(environment: string): Promise<StackSummary[]> {
    const existingStacks: any = await listStacks(['CREATE_COMPLETE', 'ROLLBACK_COMPLETE', 'UPDATE_COMPLETE', 'CREATE_IN_PROGRESS', 'DELETE_IN_PROGRESS', 'DELETE_FAILED', 'UPDATE_ROLLBACK_COMPLETE']);

    return existingStacks.filter((s: any) => {
      return s.StackName.startsWith(environment + '-');
    })
  }

  async load() {
    this.stacks = await Environment.getStacks(this.name)

    this.packages = this.stacks.map((s) => {
      return Package.fromStackName(s.StackName as string);
    }).filter(p => !!p);

    this.packages = this.stacks.map((s) => {
      const pkg = Package.fromStackName(s.StackName as string);
      if (pkg.stack) {
        pkg.stack.summary = s;
      }
      return pkg;
    });
    if (this.packages?.length) {
      //Environments[this.name] = this;
    }
  }

  async getStacks(): Promise<StackSummary[]> {
    this.stacks = (await Environment.getStacks(this.name)).filter(s => s.StackName ? s.StackName.startsWith(this.name + '-') : false);
    return this.stacks;
  }
}
