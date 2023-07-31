import { suite } from 'uvu';
import { Stub, stubMethod } from 'hanbi';
import { equal } from 'uvu/assert';
import { CenvLog } from '@stoked-cenv/lib';

type cenvFuncs =  "stdLog" | "infoLog" | "alertLog" | "info" | "err" | "alert" | "errorLog" | "catchLog" | 'verboseLog';
type properties = "stdLog" | "infoLog" | "alertLog" | "info" | "err" | "alert" | "errorLog" | "catchLog" | "prototype" | "instance" | "colors" | "logLevel" | "single" | "isVerbose" | "isInfo" | "isAlert" | "isStdout";
export function createMock(name: string, funcName?: cenvFuncs) {
  const logSpySuite = (name: string) => {
    let lgSuite;
    if (funcName) {
      lgSuite = suite<{ logSpy: Stub<CenvLog[typeof funcName]> }>(name);
    } else {
      lgSuite = suite<{ logSpy: Stub<Console['log']>}>(name);
    }
    lgSuite.before((context) => {
        context.logSpy = stubMethod(console, 'log');
    });
    lgSuite.after.each(({ logSpy }) => {
      logSpy.reset();
    });
    return lgSuite;
  };

  let mock;
  if (funcName) {
    mock = (expected: any, spy: Stub<CenvLog[typeof funcName]>) => {
      equal(spy.firstCall?.args[0], expected);
    }
  } else {
    mock = (expected: any, spy: Stub<Console['log']>) => {
      equal(spy.firstCall?.args[0], expected);
    }
  }

  return {suite: logSpySuite(name), mock};
}