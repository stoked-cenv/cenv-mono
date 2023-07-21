import {TestingModule} from "@nestjs/testing";
import DeployCommand from '../../commands/deploy';
import DestroyCommand from '../../commands/destroy';
import AddCommand from '../../commands/add';
import ParamsCommand from '../../commands/params'
import {CommandTestFactory} from 'nest-commander-testing';
import {EnvironmentStatus, Package} from '@stoked-cenv/lib';

describe('package - deploy/view/verify/destroy/verify', () => {
  let commandInstance: TestingModule;
  const hour = 60 * 60 * 1000;

  beforeAll(async () => {
    commandInstance = await CommandTestFactory.createTestingCommand({
                                                                      imports: [DeployCommand, DestroyCommand, AddCommand, ParamsCommand]
                                                                    }).compile()
  });


  const packageName = '@stoked-cenv/www-service';

  it(`cenv deploy ${packageName}`, async () => {
    process.env.CENV_LOG_LEVEL = 'minimal';
    const spawnSpy = jest.spyOn(global.console, 'warn');
    const output = await CommandTestFactory.run(commandInstance, `deploy ${packageName} -d -cli -ll minimal`.split(' '));

  }, hour);

  it(`verify status of ${packageName} is fully deployed`, async () => {
    const pkg = await Package.fromPackageName(packageName);
    await Package.checkStatus();
    if (pkg.environmentStatus !== EnvironmentStatus.UP_TO_DATE) {
      throw new Error(`${packageName} nod successfully deploy`);
    }
  }, hour);
  /*

  it(`cenv destroy ${packageName}`, async () => {
    process.env.CENV_LOG_LEVEL = 'minimal';
    const spawnSpy = jest.spyOn(global.console, 'warn');
    const output = await CommandTestFactory.run(commandInstance, `destroy ${packageName} -d -cli -ll minimal`.split(' '));
  }, hour);

  it(`verify ${packageName} has been completely removed`, async () => {
    const pkg = await Package.fromPackageName(packageName);
    await pkg.checkStatus();
    if (pkg.environmentStatus !== EnvironmentStatus.NOT_DEPLOYED) {
      throw new Error(`${packageName} nod successfully deploy`);
    }
  }, hour);
*/
  //afterAll(async () => {
  //});
});
