import { Stub, stubMethod } from 'hanbi';
import { CommandFactory } from 'nest-commander';
import { join } from 'path';
import { suite } from 'uvu';
import { equal } from 'uvu/assert';
import { CliModule } from '@stoked-cenv/cli';
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

export const CenvVersionFlagSuite = logSpySuite('Cenv Version Flag');
CenvVersionFlagSuite('--version=true', async ({ logSpy }) => {
  setArgv('--version=true');
  await CommandFactory.run(CliModule);
  commandMock({ version: true }, logSpy);
});

export const CenvHelpFlagSuite = logSpySuite('Cenv Help Flag');
CenvHelpFlagSuite('--help=true', async ({ logSpy }) => {
  setArgv('--help=true');
  await CommandFactory.run(CliModule);
  commandMock({ help: true }, logSpy);
});

export const UnknownCommandSuite = logSpySuite('Unknown Command/Print Help');
UnknownCommandSuite('should not throw an error', async () => {
  const exitSpy = stubMethod(process, 'exit');
  process.argv = [
    process.argv[0],
    join(__dirname, '../../../src/cenv.js'),
    '--help',
  ];

  const stdErrSpy = stubMethod(process.stderr, 'write');
  const stdoutSpy = stubMethod(process.stdout, 'write');
  try {
    await CommandFactory.run(CliModule);
  } finally {
    stdErrSpy.restore();
    stdoutSpy.restore();
    equal(stdErrSpy.firstCall?.args, [
      "error: unknown option '--help'\n(Did you mean --help?)\n",
    ]);
    equal(stdoutSpy.firstCall?.args, [outputHelp]);
    exitSpy.restore();
  }
});
UnknownCommandSuite('should not throw an error', async () => {
  const exitSpy = stubMethod(process, 'exit');
  process.argv = [
    process.argv[0],
    join(__dirname, '../../../src/cenv.js'),
    '--help',
  ];

  const stdErrSpy = stubMethod(process.stderr, 'write');
  const stdoutSpy = stubMethod(process.stdout, 'write');
  try {
    await CommandFactory.run(CliModule, {
      errorHandler: (err) => {
        console.log(err.message);
        process.exit(0);
      },
    });
  } finally {
    stdErrSpy.restore();
    stdoutSpy.restore();
    equal(stdErrSpy.firstCall?.args, [
      "error: unknown option '--help'\n(Did you mean --help?)\n",
    ]);
    equal(stdoutSpy.firstCall?.args, [outputHelp]);
    exitSpy.restore();
  }
});
