import { CommandFactory } from 'nest-commander';
import { join } from 'path';
import { equal } from 'uvu/assert';
import { BasicModule } from '../../../src/basic.module';
import { createMock } from '../../common/log.mock';

const [firstArg] = process.argv;
// overwrite the second arg to make commander happy
const secondArg = join(__dirname, '../../../src/commands/basic.command.js');
function setArgv(...args: string[]) {
  process.argv = [firstArg, secondArg, ...args];
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

const stdSpyMock = createMock('stdLog', 'Cenv Version Flag', );
export const CenvVersionFlagSuite = stdSpyMock.suite;

const version =
  `@stoked-cenv/cli: 2.0.0-a.41
  @stoked-cenv/lib: 2.0.0-a.41
  @stoked-cenv/ui: 2.0.0-a.41`
CenvVersionFlagSuite('--version', async ({ logSpy }) => {
  setArgv('--version');
  await CommandFactory.run(BasicModule);
  stdSpyMock.mock(version, logSpy);
});

CenvVersionFlagSuite('-v', async ({ logSpy }) => {
  setArgv('-v');
  await CommandFactory.run(BasicModule);
  stdSpyMock.mock(version, logSpy);
});
/*
export const CenvHelpFlagSuite = logSpySuite('Cenv Help Command');
CenvHelpFlagSuite(' --help=true', async ({ logSpy }) => {
  setArgv('--help', 'true');
  await CommandFactory.run(BasicModule);
  stdSpyMock.mock({ help: true }, logSpy);
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
    await CommandFactory.run(BasicModule);
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
    await CommandFactory.run(BasicModule, {
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
 */