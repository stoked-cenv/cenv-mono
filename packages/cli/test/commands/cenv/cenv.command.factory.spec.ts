import { TestingModule } from '@nestjs/testing';
import { CommandTestFactory } from 'nest-commander-testing';
import { spy, Stub } from 'hanbi';
import { suite } from 'uvu';
import { equal } from 'uvu/assert';
import { BasicModule } from '../../../src/basic.module';
import { CenvLog } from '@stoked-cenv/lib';
import path from "path";

export const CenvCommandSuite = suite<{
  commandInstance: TestingModule;
  logMock: Stub<CenvLog['stdLog']>;
  args: string[];
}>('Cenv Command With Factory');

CenvCommandSuite.before(async (context) => {
 
});

CenvCommandSuite.after.each(({ logMock , args}) => {
  logMock.reset();
});

CenvCommandSuite(
  
  `${['--version']} \tlogs @stoked-cenv/cli: 2.0.0-a.41\n' + '@stoked-cenv/lib: 2.0.0-a.41\n' + '@stoked-cenv/ui: 2.0.0-a.41}`,
  async ({ commandInstance, logMock, args }) => {
    logMock = spy();
    args = ['cenv'];
    commandInstance = await CommandTestFactory.createTestingCommand({
                                                                              imports: [BasicModule],
                                                                            })
                                                      .overrideProvider(CenvLog)
                                                      .useValue({ infoLog: logMock.handler })
                                                      .compile();
    await CommandTestFactory.run(commandInstance, [...args, ...['--version']]);
    equal(logMock.firstCall?.args[0], { param: ['cenv'], ...['@stoked-cenv/cli: 2.0.0-a.41\n' + '@stoked-cenv/lib: 2.0.0-a.41\n' + '@stoked-cenv/ui: 2.0.0-a.41'] });
  },
);

CenvCommandSuite(
  `${['--help']} \tlogs ${JSON.stringify(['Usage: cenv [options] [command]\n' + '\n' + 'Options:\n' + '  -v, --version    Display cenv\'s installed version\n' + '  -h, --help       display help for command\n' + '\n' + 'Commands:\n' + '  basic [options]  A parameter parse'])}`,
  async ({ commandInstance, logMock, args }) => {
    logMock = spy();
    args = ['cenv'];
    commandInstance = await CommandTestFactory.createTestingCommand({
                                                                      imports: [BasicModule],
                                                                    })
                                              .overrideProvider(CenvLog)
                                              .useValue({ infoLog: logMock.handler })
                                              .compile();
    await CommandTestFactory.run(commandInstance, [...args, ...['--help']]);
    equal(logMock.firstCall?.args[0], { param: ['cenv'], ...['Usage: cenv [options] [command]\n' + '\n' + 'Options:\n' + '  -v, --version    Display cenv\'s installed version\n' + '  -h, --help       display help for command\n' + '\n' + 'Commands:\n' + '  basic [options]  A parameter parse'] });
  },
);
