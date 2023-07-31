import path, { join } from 'path';
import { equal, not } from 'uvu/assert';
import { CliModule } from '../../../src/cli/cli.module';
import { suite } from 'uvu';
import { TestingModule } from '@nestjs/testing';
import { spy, Stub, stub, stubMethod } from 'hanbi';
import { CommandTestFactory } from 'nest-commander-testing';
import { Cenv, CenvLog, CenvStdio } from '@stoked-cenv/lib';

const [firstArg] = process.argv;
// overwrite the second arg to make commander happy
const secondArg = join(__dirname, '../../../dist/main.js');
function setArgv(...args: string[]) {
  process.argv = [firstArg, secondArg, ...args];
}


export const ConfigCommandSuite  = suite<{
  commandInstance: TestingModule;
  logMock: Stub<CenvLog['infoLog']>;
  args: string[];
}>('Command Config');
ConfigCommandSuite.before(async (context) => {
  context.logMock = spy();
  context.args = ['node', join(__dirname, '../../../src/main.js'), 'config'];
  CommandTestFactory.setAnswers([
                                  'default'
                                ]);
  context.commandInstance = await CommandTestFactory.createTestingCommand({
                                                                            imports: [CliModule],
                                                                          })
                                                    .overrideProvider(CenvLog)
                                                    .useValue({ infoLog: context.logMock.handler })
                                                    .compile();

});

ConfigCommandSuite.after.each(({ logMock }) => {
  logMock.reset();
});

ConfigCommandSuite(
  `correct prompts for setting up the config`,
  async ({ commandInstance, logMock, args }) => {
    const stdio = Cenv.stdio;
    await CommandTestFactory.run(commandInstance, args);

    not.equal(process.env.AWS_PROFILE, undefined);
    not.equal(process.env.ENV, undefined);
    not.equal(process.env.AWS_REGION, undefined);
    not.equal(process.env.AWS_PROFILE, undefined);
  },
);


/*

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

const versionTester = createMock('Cenv Version Flag', 'stdLog');
export const CenvVersionFlagSuite = versionTester.suite;

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
  --profile <profile>                    Profile to use for aws commands a.k.a. "AWS_PROFILE"
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
  ui|s [options]                         Launch UI to manage an environment's infrastructure
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
export const HelpUnknownCommandSuite = logSpySuite('Unknown Command/Print Help');
HelpUnknownCommandSuite('should not throw an error', async () => {
  const exitSpy = stubMethod(process, 'exit');
  process.argv = [
    process.argv[0],
    join(__dirname, 'basic.command.js'),
    '--hepl',
  ];
  const stdErrSpy = stubMethod(process.stderr, 'write');
  const stdoutSpy = stubMethod(process.stdout, 'write');
  try {
    await CommandFactory.run(CliModule);
  } finally {
    stdErrSpy.restore();
    stdoutSpy.restore();
    equal(stdErrSpy.firstCall?.args, [
      "error: unknown option '--hepl'\n(Did you mean --help?)\n",
    ]);
    equal(stdoutSpy.firstCall?.args, [outputHelp]);
    exitSpy.restore();
  }
});
HelpUnknownCommandSuite('should not throw an error', async () => {
  const exitSpy = stubMethod(process, 'exit');
  process.argv = [
    process.argv[0],
    join(__dirname, 'basic.command.js'),
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

*/