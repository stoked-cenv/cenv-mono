import { Stub, stubMethod } from 'hanbi';
import { CommandFactory } from 'nest-commander';
import { join } from 'path';
import { suite } from 'uvu';
import { equal } from 'uvu/assert';
import { CliModule } from '../../src/cli.module';
import { ExpectedParam, setArgv } from './cenv.command.expect';

const outputHelp = `Usage: basic.command [options] [command]

Options:
  -h, --help       display help for command

Commands:
  basic [options]  A parameter parse
  help [command]   display help for command
`;

const logSpySuite = (name: string) => {
  const lgSuite = suite<{ logSpy: Stub<Console['log']> }>(name);
  lgSuite.before((context) => {
    context.logSpy = stubMethod(console, 'log');
  });
  lgSuite.after.each(({ logSpy }) => {
    logSpy.reset();
  });
  return lgSuite;
};

export function commandMock(
  expected: ExpectedParam,
  spy: Stub<Console['log']>,
): void {
  equal(spy.firstCall?.args[0], { ...expected });
}

export const VersionCommandSuite = logSpySuite('Cenv Version Command');
VersionCommandSuite('--version=true', async ({ logSpy }) => {
  setArgv('--version=true');
  await CommandFactory.run(CliModule);
  commandMock({ version: true }, logSpy);
});
