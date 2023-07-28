import { Stub, stubMethod } from 'hanbi';
import { CommandFactory } from 'nest-commander';
import { join } from 'path';
import { suite } from 'uvu';
import { equal } from 'uvu/assert';
import { CliModule } from '@stoked-cenv/cli';

type ExpectedParam =
  | Record<'help', boolean>
  | Record<'version', boolean>

const [firstArg] = process.argv;
// overwrite the second arg to make commander happy
const secondArg = join(__dirname, '../../../commands/cenv.ts');

function setArgv(...args: string[]) {
  process.argv = [firstArg, secondArg, 'cenv', ...args];
}


const outputHelp = `test-stoked-cenv:  String Command
test-stoked-cenv: Usage: cenv [options] [command]

Options:
  -v, --version                          Display cenv's installed version
  -h, --help                             display help for command

Commands:
  deploy|i [options] [...applications]   Deploy infrastructure
  destroy|u [options] [...applications]  The destroyer of things (suites, environments, stacks, app config, parameters, and ecr)
  ui|s [options]                         Launch UI
  add|update [options] <key> [value]     Add parameter(s) to package
  rm [options] [key] [moreKeys...]       Add parameter(s) to package
  params [options]                       Init, deploy, and display package parameters
  docker [options]                       Build and push docker containers to ecr
  build [options]                        Build packages
  init [options]                         Initialize cenv in an existing monorepo
  new|n [options] <name>                 Create a new cenv project
  exec [options]                         Execute command using cenv context
  configure|config [options]             Configure the cli for a specific deployment.
  stat|status [options]                  Get the state of a package's current code as it compares to the infrastructure
  test [options]                         Build and push docker containers to ecr
  pull [options] [options]               Pull the latest application configuration
  push [options]                         Push locally updated application configuration variables
  bump [options]                         Bump packages
  clean [options]                        Clean currently configured local files related to data in the .cenv configuration
  env [options] [environment]            Manage application environments with this command
  lambda [options]                       Update lambda cenv params
  docs [command]                         Display help UI
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
  equal(spy.firstCall?.args[0], { param: ['test'], ...expected });
}

export const VersionCommandSuite = logSpySuite('String Command');
VersionCommandSuite('--version', async ({ logSpy }) => {
  setArgv('--version=true');
  await CommandFactory.run(CliModule);
  commandMock({ version: true }, logSpy);
});

VersionCommandSuite('-v true', async ({ logSpy }) => {
  setArgv('-v', 'true');
  await CommandFactory.run(CliModule);
  commandMock({ version: true }, logSpy);
});

export const HelpCommandSuite = logSpySuite('Number Command');
HelpCommandSuite(' --number=10', async ({ logSpy }) => {
  setArgv('--number=10');
  await CommandFactory.run(CliModule);
  commandMock({ help: true }, logSpy);
});

export const UnknownCommandSuite = logSpySuite('Unknown Command/Print Help');
UnknownCommandSuite('should not throw an error', async () => {
  const exitSpy = stubMethod(process, 'exit');
  process.argv = [
    process.argv[0],
    join(__dirname, './commands/cenv.js'),
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
    join(__dirname, './commands/cenv.js'),
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