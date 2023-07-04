import { TestingModule } from "@nestjs/testing";
import DeployCommand from '../../commands/deploy';
import DestroyCommand from '../../commands/destroy';
import AddCommand from '../../commands/add';
import ParamsCommand from '../../commands/params'
import { CommandTestFactory } from 'nest-commander-testing';
import { CenvFiles, EnvironmentStatus, getMonoRoot, Package, packagePath, Suite } from "@stoked-cenv/lib";
import { expect, it, jest, test } from '@jest/globals';
import path from "path";

describe('Init Command', () => {
  let commandInstance: TestingModule;
  const hour = 60 * 60 * 1000;

  beforeAll(async () => {
    commandInstance = await CommandTestFactory.createTestingCommand({
      imports: [
        DeployCommand,
        DestroyCommand,
        AddCommand,
        ParamsCommand
      ] }).compile()
  });


  const cenvConfig = require(path.join(getMonoRoot(), './cenv.json'));
  const defaultSuite = cenvConfig.defaultSuite;


  it(`cenv deploy ${defaultSuite}`, async () => {
    const spawnSpy = jest.spyOn(global.console, 'warn');
    await CommandTestFactory.run(commandInstance, `deploy ${defaultSuite} -cli -ll minimal`.split(' '));

  }, hour);

  it(`verify suite ${defaultSuite} packages have been completely deployed`, async () => {
    const suite = new Suite(defaultSuite);
    await Promise.all(await Package.checkStatus());
    suite.packages.forEach((p: Package) => {
      if (p.environmentStatus !== EnvironmentStatus.UP_TO_DATE) {
        throw new Error(`${p.packageName} not fully deployed`);
      }
    });
  }, hour);

  it(`cenv destroy ${defaultSuite}`, async () => {
    const spawnSpy = jest.spyOn(global.console, 'warn');
    await CommandTestFactory.run(commandInstance, `destroy ${defaultSuite} -cli -ll minimal`.split(' '));

  }, hour);

  it(`verify suite ${defaultSuite} has been completely removed`, async () => {
    const suite = new Suite(defaultSuite);
    await Promise.all(await Package.checkStatus());
    suite.packages.forEach((p: Package) => {
      if (p.environmentStatus !== EnvironmentStatus.UP_TO_DATE) {
        throw new Error(`${p.packageName} not completely removed`);
      }
    });
  }, hour);

  //afterAll(async () => {
  //});
});