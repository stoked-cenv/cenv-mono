import { ClientMode, startCenv, PackageCmd, Package } from '@stoked-cenv/lib';

export class Test {

  static async exec(packages: any, test: any) {
    if (Array.isArray(test)) {
      test = test[0];
    }
    let envVars = {}
    if (packages.hasCenvVars) {
      envVars = await startCenv(ClientMode.REMOTE_ON_STARTUP);
    }
    if (process.env.CENV_LOG_LEVEL) {
      envVars = { ...envVars, CENV_LOG_LEVEL: process.env.CENV_LOG_LEVEL };
    }
    await Promise.all(packages.map( async(p: Package) => {
      await p.pkgCmd(`jest --config ./src/jest.config.ts ${test}`, { envVars })
    }))
  }

}
