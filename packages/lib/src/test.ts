import {ClientMode, startCenv} from "./aws/appConfigData";
import {Package} from "./package/package";

export class CenvTest {

  static async exec(test: string, packages?: Package[], ) {
    if (Array.isArray(test)) {
      test = test[0];
    }
    let envVars = {}

    if (process.env.CENV_LOG_LEVEL) {
      envVars = {CENV_LOG_LEVEL: process.env.CENV_LOG_LEVEL};
    }

    console.log('dirname', __dirname);
    if (!packages) {
      return;
    }
    await Promise.all(packages.map(async (p: Package) => {
      if (p.params?.hasCenvVars) {
        const vars = await startCenv(ClientMode.REMOTE_ON_STARTUP);
        envVars = {...vars, ...envVars};
      }
      await p.pkgCmd(`jest --config ${__dirname}/../../src/test/jest.config.ts ${test}`, {envVars})
    }))
  }
}