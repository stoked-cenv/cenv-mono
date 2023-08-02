import { join } from 'path';
import { equal, not } from 'uvu/assert';
import { CliModule } from '../../../src/cli/cli.module';
import { suite } from 'uvu';
import { TestingModule } from '@nestjs/testing';
import { spy, Stub } from 'hanbi';
import { CommandTestFactory } from 'nest-commander-testing';
import { CenvLog, cleanTags } from '@stoked-cenv/lib';
import { createMock } from '../../common/log.mock';
import { CommandFactory } from 'nest-commander';

const [firstArg] = process.argv;
// overwrite the second arg to make commander happy
const secondArg = join(__dirname, '../../../dist/main.js');

function setArgv(...args: string[]) {
  process.argv = [firstArg, secondArg, ...args];
}

export const ConfigCommandSuite = suite<{
  commandInstance: TestingModule; logMock: Stub<CenvLog['infoLog']>; args: string[];
}>('Command Config Create Defaults');
ConfigCommandSuite.before(async (context) => {
  context.logMock = spy();
  context.args = ['node', join(__dirname, '../../../src/main.js'), 'config'];
  CommandTestFactory.setAnswers(['default']);
  context.commandInstance = await CommandTestFactory.createTestingCommand({
                                                                            imports: [CliModule],
                                                                          })
                                                    .overrideProvider(CenvLog)
                                                    .useValue({ infoLog: context.logMock.handler })
                                                    .compile();

});

ConfigCommandSuite.after.each(({ logMock }) => {
  logMock.reset();
});

ConfigCommandSuite(`correct prompts for setting up the config`, async ({ commandInstance, logMock, args }) => {
  await CommandTestFactory.run(commandInstance, args);

  not.equal(process.env.AWS_PROFILE, undefined);
  not.equal(process.env.ENV, undefined);
  not.equal(process.env.AWS_REGION, undefined);
  not.equal(process.env.AWS_PROFILE, undefined);
});

export const showMock = createMock('Cenv Config Show', 'stdLog');
export const ConfigShowCommandSuite = showMock.suite;
ConfigShowCommandSuite('correct output for: cenv config -s', async ({ logSpy }) => {
  setArgv(...'config -s'.split(' '));
  await CommandFactory.run(CliModule);
  const showOutputRegex = new RegExp(/\{\n\ {2}\"AWS_PROFILE": "default",\n {2}"AWS_REGION": "us-east-1",\n {2}"ENV": "test",\n {2}"ROOT_DOMAIN": ".*",\n {2}"CDK_DEFAULT_ACCOUNT": "[0-9]*",\n {2}"AWS_ACCOUNT_USER": "[A-Z_0-9]*",\n {2}"AWS_ACCOUNT_USER_ARN": "arn:aws:iam::[0-9]*:user\/.*",\n {2}"CDK_DEFAULT_REGION": "us-east-1",\n {2}"CI": "true"\n\}/gm);
  const clean = cleanTags(logSpy.firstCall?.args[0]);
  const match = clean.match(showOutputRegex);
  equal(match?.length, 1);
});

const envVarMock = createMock('Cenv Config Create Via Env Vars', 'stdLog');
export const ConfigViaEnvVarsSuite = envVarMock.suite;
ConfigViaEnvVarsSuite('create new prod config: cenv config --env prod', async ({ logSpy }) => {
  setArgv(...'config --env prod'.split(' '));
  await CommandFactory.run(CliModule);
  const showOutputRegex = new RegExp(/\{\n\ {2}\"AWS_PROFILE": "default",\n {2}"AWS_REGION": "us-east-1",\n {2}"ENV": "test",\n {2}"ROOT_DOMAIN": ".*",\n {2}"CDK_DEFAULT_ACCOUNT": "[0-9]*",\n {2}"AWS_ACCOUNT_USER": "[A-Z_0-9]*",\n {2}"AWS_ACCOUNT_USER_ARN": "arn:aws:iam::[0-9]*:user\/.*",\n {2}"CDK_DEFAULT_REGION": "us-east-1",\n {2}"CI": "true"\n\}/gm);
  const clean = cleanTags(logSpy.firstCall?.args[0]);
  const match = clean.match(showOutputRegex);
  equal(match?.length, 1);
});
