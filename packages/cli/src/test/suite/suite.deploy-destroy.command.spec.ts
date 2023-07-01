import { TestingModule } from "@nestjs/testing";
import DeployCommand from '../../commands/deploy';
import DestroyCommand from '../../commands/destroy';
import AddCommand from '../../commands/add';
import BuildCommand from '../../commands/build';
import ParamsCommand from '../../commands/params'
import { CommandTestFactory } from 'nest-commander-testing';
import { CenvFiles, EnvironmentStatus, Package, packagePath, Suite } from '@stoked-cenv/lib';
import { beforeAll, expect, it, jest, test } from '@jest/globals';
import path from 'path';

describe('deploy / destroy suite', () => {
  let commandInstance: TestingModule;
  const hour = 60 * 60 * 1000;

  beforeAll(async () => {
    commandInstance = await CommandTestFactory.createTestingCommand({
      imports: [
        DeployCommand,
        BuildCommand,
        DestroyCommand,
        AddCommand,
        ParamsCommand
      ] }).compile()
  });

  const suiteName = 'curb-cloud'
  CenvFiles.GlobalPath = path.join(packagePath('@stoked-cenv/cenv-globals'), CenvFiles.PATH);

  const spawnSpy = jest.spyOn(global.console, 'log');
  const spawnSpy1 = jest.spyOn(global.console, 'error');
  const spawnSpy2 = jest.spyOn(global.console, 'warn');

  it(`cenv build all`, async () => {

    //await CommandTestFactory.run(commandInstance, `build all -p 1`.split(' '));
  }, hour);

  it(`cenv deploy ${suiteName}`, async () => {
    await CommandTestFactory.run(commandInstance, `deploy ${suiteName} -cli -sb`.split(' '));
  }, hour);

  it(`verify suite ${suiteName} packages have been completely deployed`, async () => {
    new Suite(suiteName);
    await Package.checkStatus();
    const packages = Package.getPackages()
    const notUpToDate = packages.filter(p => p.environmentStatus !== EnvironmentStatus.UP_TO_DATE).map(p => p.packageName);
    expect(notUpToDate.join(', ')).toBe('');
  }, hour);

  it(`cenv destroy ${suiteName}`, async () => {
    await CommandTestFactory.run(commandInstance, `destroy ${suiteName} -cli -ll minimal`.split(' '));
  }, hour);

  it(`verify suite ${suiteName} has been completely removed`, async () => {
    new Suite(suiteName);
    await Package.checkStatus();
    const packages = Package.getPackages()
    const notCorrect = packages.filter(p => p.environmentStatus !== EnvironmentStatus.NOT_DEPLOYED).map(p => p.packageName);
    expect(notCorrect.join(', ')).toBe('');
  }, hour);

  //afterAll(async () => {
  //});
});
