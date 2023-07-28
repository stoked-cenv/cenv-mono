import { suite } from 'uvu';
import { Stub, stubMethod } from 'hanbi';
import { equal } from 'uvu/assert';
import { CenvLog } from '@stoked-cenv/lib';

export function createMock(funcName: 'stdLog' | 'infoLog' | 'verboseLog' | 'alertLog' | 'errorLog', name: string) {
  const logSpySuite = (name: string) => {
    const lgSuite = suite<{ logSpy: Stub<CenvLog[typeof funcName]> }>(name);
    lgSuite.before((context) => {
      context.logSpy = stubMethod(console, 'log');
    });
    lgSuite.after.each(({ logSpy }) => {
      logSpy.reset();
    });
    return lgSuite;
  };

  const commandMock = (expected: any, spy: Stub<CenvLog[typeof funcName]>) => {
    equal(spy.firstCall?.args[0], expected);
  }

  return {suite: logSpySuite(name), mock: commandMock};
}