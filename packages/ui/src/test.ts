import { ClientMode, startCenv, PackageCmd, Package } from '@stoked-cenv/lib';

export class Test {

  static async exec(ctx: any, test: any): Promise<PackageCmd> {
    if (Array.isArray(test)) {
      test = test[0];
    }
    let envVars = {}
    if (ctx.pkg.hasCenvVars) {
      envVars = await startCenv(ClientMode.REMOTE_ON_STARTUP);
    }
    if (process.env.CENV_LOG_LEVEL) {
      envVars = { ...envVars, CENV_LOG_LEVEL: process.env.CENV_LOG_LEVEL };
    }
    return await Package.pkgCmd(ctx.pkg, `jest --config ./src/jest.config.ts ${test}`, { envVars })
  }

}
