import {ClientMode, Package, startCenv} from '@stoked-cenv/lib';

export class Test {

  static async exec(packages: any, test: any) {
    if (Array.isArray(test)) {
      test = test[0];
    }
    let envVars = {}
    if (process.env.CENV_LOG_LEVEL) {
      envVars = {...envVars, CENV_LOG_LEVEL: process.env.CENV_LOG_LEVEL};
    }
    await Promise.all(packages.map(async (p: Package) => {
      if (packages.hasCenvVars) {
        envVars = await startCenv(ClientMode.REMOTE_ON_STARTUP, p.packageName);
      }
      await p.pkgCmd(`jest --config ./src/jest.config.ts ${test}`, {envVars})
    }))
  }

}
