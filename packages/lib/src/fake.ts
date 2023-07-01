import { randomRange, sleep } from './utils';
import { Package } from './package/package'
export default class Fake {
  static fakeSuccessTaskTimeouts: any = {};
  static randomTasks = [
    'cenv params -D',
    'cenv deploy -p',
    'docker build -t awesomesauce:latest .',
    'cenv destroy --parameters --config',
    'cenv destroy --ecr',
    'cdk deploy',
    'cdk bootstrap --velidate'
  ]
  static randomOutput = [
    '"undefined": "[{\\"name\\":\\"GLOBAL\\",\\"stackName\\":\\"GLOBAL\\",\\"docker\\":{\\"type\\":\\"DOCKER\\",\\"name\\":\\"GLOBAL\\",\\"path\\":\\"/Users/stoked/code/curb/curb-cloud\\"},\\"hasCenvVars\\":false,\\"statusTime\\":1676549753222,\\"status\\":\\"PROCESSING\\",\\"timer\\":{\\"start\\":[98042,909398666],\\"format\\":\\"seconds\\",\\"note\\":\\"GLOBAL\\",\\"silent\\":true},\\"cmds\\":[{\\"cmd\\":\\"pre cmd log: \\",\\"stdout\\":\\"----------------------------------------"',
    '-------------------------------\\\\nInitial Dependencies\\\\n------------------------------------------"',
    '-----------------------------\\\\nto-process 16 GLOBAL, dev-sa',
    'mple-data-ingress, dev-hub-logs-timestream, dev-backend-authenticator, dev-aws-service',
    '-utility, dev-network, dev-root, dev-cenv-lib, dev-jslib, dev-site-certificate, dev-installation-ui, dev-timestream, dev-core-middleware, dev-installation-service, dev-live-data-se',
    'rvice, dev-hardware-configuration\\\\nprocessing 0 \\\\ndependencies 7\\\\n  - dev-cenv-lib\\\\n    - dev-root\\\\n  - dev-installation',
    '-ui\\\\n    - dev-network\\\\n    - dev-site-certificate\\\\n  - dev-timestream\\\\n    - dev-network\\\\n    - dev-site-certificate\\\\n  - dev-core-middleware\\\\n    - dev-jslib\\\\n    - dev-network\\\\n    - dev-site-certificate\\\\n  - dev-installation-service\\\\n    - dev-cenv-lib\\\\n    - dev-site-certificate\\\\n    - dev-network\\\\n  - dev-live-data-service\\\\n    - dev-jslib\\\\n    -',
    'dev-network\\\\n    - dev-site-certificate\\\\n  - dev-hardware-configuration\\\\n    - dev-network\\\\n    - dev-site-certificate\\\\n-----------------------------------------------------------------------\\',
    '\\n[dev-hub-logs-timestream] cdk deploy --require-approval never --no-color -m direct started with id (0)\\\\n[dev-network] cdk deploy --require-approval never --no-color -m direct started with id (',
    '0)\\\\n[dev-site-certificate] cdk de',
    'ploy --require-approval never --no-colo',
    'r -m direct started with id (0)\\\\n[dev-sample-data-ingress] cenv init started with id (0)\\\\n-----------------------------------------------------------------------\\\\ndev-root complete\\\\n-----------------------------------------------------------------------\\\\nto-process 7 dev-cenv-lib, dev-installation-ui, dev-timestream, dev-core-middleware, dev-installation-service, dev-live-data-service, dev-hardware-configuration\\\\nprocessing 8 GLOBAL, dev-sample-data-ingress, dev-hub-logs-timestream, dev-backend-authenticator, dev-aws-service-utility, dev-network, dev-jslib, dev-s',
    'ite-certificate\\\\ndependencies 6\\\\n  - dev-installation-ui\\\\n    - dev-network\\\\n    - dev-site-certificate\\\\n  - dev-times',
    'tream\\\\n    - dev-network\\\\n    - dev-site-certificate\\\\n  - dev-core-middleware\\\\n    - dev-jslib\\\\n    - dev-network\\\\n    - dev-site-certificate\\\\n  - dev-ins',
    'tallation-service\\\\n    - dev-cenv-lib\\\\n    - dev-site-certificate\\\\n    - dev-network\\\\n  - dev-live-data-service\\\\n    - dev-jslib\\\\n    - dev-network\\\\n    - dev-site-certificate\\\\n  - dev-hardware-configuration\\\\n    - dev-network\\\\n    - dev-site-certificate\\\\n-----------------------------------------------------------------------\\\\n-----------------------------------------------------------------------\\\\ndev-jslib complete\\\\n-----------------------------------------------------------------------\\\\nto-process 6 dev-installation-ui, dev-timestream, dev-core-middleware, dev-installation-service, dev-live-data-service, dev-hardware-configuration\\\\nprocessing 8 GLOBAL, dev-sample-data-ingress, dev-hub-logs-timestream, dev-backend-authenticator, dev-aws-service-utility, dev-network, dev-site-certificate, dev-cenv-lib\\\\ndependencies 6\\\\n  -',
    'dev-installation-ui\\\\n    - dev-network\\\\n    - dev-site-certificate\\\\n  - dev-timestream\\\\n    - dev-network\\\\n    - dev-site-certificate\\\\n  - dev-core-middleware\\\\n    - dev-network\\\\n    - dev-site-certificate\\\\n  - dev-installation-service\\\\n    - dev-cenv-lib\\\\n    - dev-site-certificate\\\\n    - dev-network\\\\n  - dev-live-data-service\\\\n    - dev-network\\\\n    - dev-site-certificate\\\\n  - dev-hardware-configuration\\\\n    - dev-network\\\\n    - dev-site-certificate\\\\n-----------------------------------------------------------------------\\\\n-----------------------------------------------------------------------\\\\ndev-cenv-lib complete\\\\n-----------------------------------------------------------------------\\\\nto-process 6 dev-installation-ui, dev-timestream, dev-core-middleware, dev-installation-service, dev-live-data-service, dev-hardware-configuration\\\\nprocessing 7 GLOBAL, dev-sample-data-ingress, dev-hub-logs-timestream, dev-backend-authenticator, dev-aws-service-utility, dev-network, dev-site-certificate\\\\ndependencies 6\\\\n  - dev-installation-ui\\\\n    - dev-network\\\\n    - dev-site-certificate\\\\n  - dev-timestream\\\\n    - dev-network\\\\n    - dev-site-certificate\\\\n  - dev-core-middleware\\\\n    - dev-network\\\\n    - dev-site-cer',
    'tificate\\\\n  - dev-installation-service\\\\n    - dev-site-certificate\\\\n    - dev-network\\\\n  - dev-live-data-service\\\\n    - dev-network\\\\n    - dev-site-certificate\\\\n  - dev-hardware-configuration\\\\n    - dev-network\\\\n    - dev-site-certificate\\\\n-----------------------------------------------------------------------\\\\n-----------------------------------------------------------------------\\\\ndev-site-certificate complete\\\\n-----------------------------------------------------------------------\\\\nto-process 6 dev-installation-ui, dev-timestream, dev-core-middleware, dev-installation-servi',
    'ce, dev-live-data-service, dev-hardware-configuration\\\\nprocessing 6 GLOBAL, dev-sample-data-ingress, dev-hub-logs-timestream, dev-backend-authenticator, dev-aws-service-utility, ',
    'dev-network\\\\ndependencies 6\\\\n  - dev-installation-ui\\\\n    - dev-network\\\\n  - dev-timestream\\\\n    - dev-network\\\\n  - dev-core-midd'
  ]

  static fakeSuccessTasks = async (pkg: Package, seconds: number) => {
    this.fakeSuccessTaskTimeouts[pkg.stackName] = true;
    setTimeout(()=> { delete this.fakeSuccessTaskTimeouts[pkg.stackName]}, (seconds - 1) * 1000)
    while (this.fakeSuccessTaskTimeouts[pkg.stackName]) {
      let cmdSeconds = randomRange(1,20)
      const cmd = pkg.createCmd(this.randomTasks[randomRange(0, this.randomTasks.length -1)])
      while(cmdSeconds-- && this.fakeSuccessTaskTimeouts[pkg.stackName]) {
        await sleep(randomRange(1, 10));
        cmd.out(this.randomOutput[randomRange(0, this.randomOutput.length - 1)])
      }
      await cmd.result(0);
    }
  }

  static success = async (pkg: Package, maxTime = 5) => {
    const seconds = randomRange(2, maxTime);
    this.fakeSuccessTasks(pkg, seconds);
    await sleep(seconds);
    return 0;
  }
}
