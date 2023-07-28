// CenvCommand
import { CenvFactorySuite } from './commands/cenv/cenv.command.factory.spec';
import { CenvHelpFlagSuite, CenvVersionFlagSuite, UnknownCommandSuite } from './commands/cenv/cenv.command.spec';

// cenv
CenvFactorySuite.run();

// cenv --version
CenvVersionFlagSuite.run();

// cenv --help
CenvHelpFlagSuite.run();

// cenv aoisdjfoijwfwf
UnknownCommandSuite.run();