import { TestingModule } from '@nestjs/testing';
import { CommandTestFactory } from 'nest-commander-testing';
import { spy, Stub } from 'hanbi';
import { suite } from 'uvu';
import { equal } from 'uvu/assert';
import { LogService } from '../../common/log.service';
import { CenvModule } from '../src/cenv.module';

export const CenvFactorySuite = suite<{
  commandInstance: TestingModule;
  logMock: Stub<Console['log']>;
  args: string[];
}>('Basic Command With Factory');

CenvFactorySuite.before(async (context) => {
  context.logMock = spy();
  context.args = ['cenv'];
  context.commandInstance = await CommandTestFactory.createTestingCommand({
    imports: [CenvModule],
  })
    .overrideProvider(LogService)
    .useValue({ log: context.logMock.handler })
    .compile();
});

CenvFactorySuite.after.each(({ logMock }) => {
  logMock.reset();
});

for (const { flagAndVal, expected } of [
  {
    flagAndVal: ['--help=true'],
    expected: { help: true },
  }
]) {
  CenvFactorySuite(
    `${flagAndVal} \tlogs ${JSON.stringify(expected)}`,
    async ({ commandInstance, logMock, args }) => {
      await CommandTestFactory.run(commandInstance, [...args, ...flagAndVal]);
      equal(logMock.firstCall?.args[0], { ...expected });
    },
  );
}
