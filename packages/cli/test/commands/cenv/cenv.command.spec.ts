import { CommandFactory } from 'nest-commander';
import path, { join } from 'path';
import { equal } from 'uvu/assert';
import { CliModule } from '../../../src/cli/cli.module';
import { createMock } from '../../common/log.mock';
import { CenvLog, colors, packagePath } from '@stoked-cenv/lib';
import { suite } from 'uvu';
import { TestingModule } from '@nestjs/testing';
import { spy, Stub, stubMethod } from 'hanbi';
import { CommandTestFactory } from 'nest-commander-testing';
import * as Console from 'console';

const [firstArg] = process.argv;
// overwrite the second arg to make commander happy
const secondArg = join(__dirname, '../../../dist/main.js');
function setArgv(...args: string[]) {
  process.argv = [firstArg, secondArg, ...args];
}

export type ExpectedParam =
  | Record<'string', string>
  | Record<'number', number>
  | Record<'boolean', boolean>;


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
  -h, --help                             Display help for command
  -e, --env <env>                        For managing cenv profiles by environment (env: ENV)
  -p, --profile <profile>                Profile to use for aws commands (env: AWS_PROFILE)
  -ll, --log-level, <logLevel>           Logging mode (env: CENV_LOG_LEVEL)

Commands:
  build [options]                        Build packages
  clean [options]                        Clean currently configured local files related to data in the .cenv configuration
  config|conf [options]                  Configure the cli for a specific aws profile and environment combination.
  deploy|i [options] [...applications]   Deploy infrastructure
  destroy|u [options] [...applications]  The destroyer of things (suites, environments, stacks, app config, parameters, and ecr)
  docker [options]                       Build and push docker containers to ecr
  docs [command]                         Display help UI
  env [options] [environment]            Manage application environments with this command
  exec [options]                         Execute command using cenv context
  lambda [options]                       Update lambda cenv params
  new|n [options] <name>                 Create a new cenv project
  params [options]                       Init, deploy, and display package parameters
  stat|status [options]                  Get the state of a package's current code as it compares to the infrastructure
  test [options]                         Build and push docker containers to ecr
  ui|s [options]                         Launch UI to manage an environment's infrastructure
`;
const consolidatedOutput = outputHelp.replace(/\s+/gm, '')

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
HelpUnknownCommandSuite('incorrect spelling of --help flag', async () => {
  const exitSpy = stubMethod(process, 'exit');
  setArgv('--hepl');
  const stdErrSpy = stubMethod(process.stderr, 'write');
  try {
    await CommandFactory.run(CliModule);
  } finally {
    stdErrSpy.restore();
    equal(stdErrSpy.firstCall?.args, [
      "error: unknown option '--hepl'\n(Did you mean --help?)\n",
    ]);
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
  const stdoutSpy = stubMethod(process.stdout, 'write');
  try {
    await CommandFactory.run(CliModule, {
      errorHandler: (err) => {
        console.log(err.message);
        process.exit(0);
      },
    });
  } finally {
    stdoutSpy.restore();
    equal(stdoutSpy.firstCall?.args[0], outputHelp);
    exitSpy.restore();
  }
});

