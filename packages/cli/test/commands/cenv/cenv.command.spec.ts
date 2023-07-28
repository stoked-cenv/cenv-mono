import { CommandFactory } from 'nest-commander';
import path, { join } from 'path';
import { equal } from 'uvu/assert';
import { CliModule } from '../../../src/cli.module';
import { createMock } from '../../common/log.mock';
import { CenvLog, colors, packagePath } from '@stoked-cenv/lib';

const [firstArg] = process.argv;
// overwrite the second arg to make commander happy
const secondArg = join(__dirname, '../../../src/commands/basic.command.js');
function setArgv(...args: string[]) {
  process.argv = [firstArg, secondArg, ...args];
}

const versionTester = createMock('stdLog', 'Cenv Version Flag', );
export const CenvVersionFlagSuite = versionTester.suite;

const cliPath = packagePath('@stoked-cenv/cli')
const libPath = packagePath('@stoked-cenv/lib')
const uiPath = packagePath('@stoked-cenv/ui')
if (!cliPath || !libPath || !uiPath) {
  CenvLog.single.catchLog(`could not find one of the package paths for the version test - cli: ${cliPath}, lib ${libPath}, ui: ${uiPath}`);
  process.exit(22);
}
const cliVersion = require(path.join(cliPath, 'package.json')).version;
const libVersion = require(path.join(libPath, 'package.json')).version;
const uiVersion = require(path.join(uiPath, 'package.json')).version;

const version =
  `${colors.info('@stoked-cenv/cli')}: ${colors.infoBold(cliVersion)}
${colors.info('@stoked-cenv/lib')}: ${colors.infoBold(libVersion)}
${colors.info('@stoked-cenv/ui')}: ${colors.infoBold(uiVersion)}`

CenvVersionFlagSuite('--version', async ({ logSpy }) => {
  setArgv('--version');
  await CommandFactory.run(CliModule);
  versionTester.mock(version, logSpy);
});

CenvVersionFlagSuite('-v', async ({ logSpy }) => {
  setArgv('-v');
  await CommandFactory.run(CliModule);
  versionTester.mock(version, logSpy);
});




const outputHelp = `Usage: cenv [options] [command]

Options:
  -v, --version                          Display cenv's installed version
  -h, --help                             display help for command

Commands:
  add|update [options] <key> [value]     Add parameter(s) to package
  build [options]                        Build packages
  clean [options]                        Clean currently configured local files related to data in the .cenv configuration
  configure|config [options]             Configure the cli for a specific deployment.
  deploy|i [options] [...applications]   Deploy infrastructure
  destroy|u [options] [...applications]  The destroyer of things (suites, environments, stacks, app config, parameters, and ecr)
  docker [options]                       Build and push docker containers to ecr
  docs [command]                         Display help UI
  env [options] [environment]            Manage application environments with this command
  exec [options]                         Execute command using cenv context
  init [options]                         Initialize cenv in an existing monorepo
  lambda [options]                       Update lambda cenv params
  new|n [options] <name>                 Create a new cenv project
  params [options]                       Init, deploy, and display package parameters
  pull [options] [options]               Pull the latest application configuration
  push [options]                         Push locally updated application configuration variables
  rm [options] [key] [moreKeys...]       Add parameter(s) to package
  stat|status [options]                  Get the state of a package's current code as it compares to the infrastructure
  test [options]                         Build and push docker containers to ecr
  ui|s [options]                         Launch UI`;

const helpTester = createMock('stdLog', 'Cenv Help Flag', );
export const CenvHelpFlagSuite = helpTester.suite;
CenvHelpFlagSuite(' --help', async ({ logSpy }) => {
  setArgv('--help');
  await CommandFactory.run(CliModule);
  helpTester.mock(outputHelp, logSpy);
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