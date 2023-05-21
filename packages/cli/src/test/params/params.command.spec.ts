import { TestingModule } from "@nestjs/testing";
import DeployCommand from '../../commands/deploy';
import DestroyCommand from '../../commands/destroy';
import AddCommand from '../../commands/add';
import ParamsCommand from '../../commands/params'
import { CommandTestFactory } from 'nest-commander-testing';


describe('params - init/add/deploy/view/verify/destroy/verify', () => {
  let commandInstance: TestingModule;

  beforeAll(async () => {
    commandInstance = await CommandTestFactory.createTestingCommand({
      imports: [
        DeployCommand,
        DestroyCommand,
        AddCommand,
        ParamsCommand
      ] }).compile()
  });

  it('init node-ecs params', async () => {
    const spawnSpy = jest.spyOn(global.console, 'warn');
    await CommandTestFactory.run(commandInstance, 'init @stoked-cenv/hello-world-node'.split(' '));

  }, 20000);

  it('add a node-ecs param', async () => {
    const spawnSpy = jest.spyOn(global.console, 'warn');
    await CommandTestFactory.run(commandInstance, 'add @stoked-cenv/hello-world-node -a NODE_ECS_PARAM value'.split(' '));

  }, 20000);

  it('deploy a node-ecs param', async () => {
    const spawnSpy = jest.spyOn(global.console, 'warn');
    await CommandTestFactory.run(commandInstance, 'deploy @stoked-cenv/hello-world-node -p'.split(' '));
  }, 20000);


  it('view current deployed node-ecs params', async () => {
    const spawnSpy = jest.spyOn(global.console, 'warn');
    await CommandTestFactory.run(commandInstance, 'params @stoked-cenv/hello-world-node -D'.split(' '));
  }, 20000);

  //afterAll(async () => {
  //});
});
