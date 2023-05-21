import { CenvLog, Package, listStacks } from '@stoked-cenv/cenv-lib';
import { Suite } from './suite';
import { StackSummary } from '@aws-sdk/client-cloudformation';

export class Environments {
  static cache: { [environmentName: string]: Environment} = {};
  static async getEnvironment(environmentName: string) {
    if (this.cache[environmentName]) {
      return this.cache[environmentName];
    }
    const env = new Environment({ environment: environmentName });
    await env.getStacks();
    return env;
  }
}

export class Environment {
  name: string;
  suite?: Suite;
  packages: Package[];
  stacks: StackSummary[];

  constructor(options?: { environment?: string, suite?: Suite}) {
    this.name = options?.environment || process.env.ENV;
    if (!this.name) {
      CenvLog.single.catchLog('environment load failed: no environment specified and no ENV variable present')
      return;
    }
    this.name = options?.environment || process.env.ENV;
    this.suite = options?.suite;
  }

  async load() {
    this.stacks = await Environment.getStacks(this.name)

    this.packages = this.stacks.map((s) => {
      return Package.fromStackName(s.StackName);
    }).filter(p => !!p);

    this.packages = this.stacks.map((s) => {
      const pkg = Package.cache[s.StackName];
      pkg.deploy.summary = s;
      return pkg;
    });
    if (this.packages?.length) {
      Environments[this.name] = this;
    }
  }

  async getStacks(): Promise<StackSummary[]> {
    this.stacks = (await Environment.getStacks(this.name)).filter(s => s.StackName.startsWith(this.name + '-'));;;
    return this.stacks;
  }

  static async fromName(environment: string): Promise<Environment> {
    const env = new Environment({environment});
    await env.load();
    return env;
  }

  static async getStacks(environment: string): Promise<StackSummary[]> {
    const existingStacks: any = await listStacks(
      [
        'CREATE_COMPLETE',
        'ROLLBACK_COMPLETE',
        'UPDATE_COMPLETE',
        'CREATE_IN_PROGRESS',
        'DELETE_IN_PROGRESS',
        'DELETE_FAILED',
        'UPDATE_ROLLBACK_COMPLETE'
      ]);

    return existingStacks.filter(s => {
      return s.StackName.startsWith(environment + '-');
    })
  }


}
