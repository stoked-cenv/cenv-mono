import { TestingModule } from '@nestjs/testing';
import { CommandTestFactory } from 'nest-commander-testing';
import { spy, Stub } from 'hanbi';
import { suite } from 'uvu';
import { equal } from 'uvu/assert';
import { CliModule } from '@stoked-cenv/cli';
import { CenvLog } from '@stoked-cenv/lib';
import path from "path";

export const ConfigureCommandSuite = suite<{
  commandInstance: TestingModule;
  logMock: Stub<Console['log']>;
  args: string[];
}>('Basic Command With Factory');

ConfigureCommandSuite.before(async (context) => {
  context.logMock = spy();
  context.args = ['cenv'];
  context.commandInstance = await CommandTestFactory.createTestingCommand({
                                                                            imports: [CliModule],
                                                                          })
                                                    .overrideProvider(CenvLog)
                                                    .useValue({ log: context.logMock.handler })
                                                    .compile();
});

ConfigureCommandSuite.after.each(({ logMock }) => {
  logMock.reset();
});

for (const { flagAndVal, expected } of [
  {
    flagAndVal: ['--version=true'],
    expected: { version: true },
  },
  {
    flagAndVal: ['-s', 'goodbye'],
    expected: { string: 'goodbye' },
  },
  {
    flagAndVal: ['--number=10'],
    expected: { number: 10 },
  },
  {
    flagAndVal: ['-n', '5'],
    expected: { number: 5 },
  },
  {
    flagAndVal: ['--boolean=true'],
    expected: { boolean: true },
  },
  {
    flagAndVal: ['-b', 'false'],
    expected: { boolean: false },
  },
]) {
  ConfigureCommandSuite(
    `${flagAndVal} \tlogs ${JSON.stringify(expected)}`,
    async ({ commandInstance, logMock, args }) => {
      CommandTestFactory.setAnswers(['truapi', '', '', 'stokedconsulting.com'])
      await CommandTestFactory.run(commandInstance, [...args, ...flagAndVal]);
      equal(logMock.firstCall?.args[0], {  ...expected });
    },
  );
}