// CenvCommand
import { CenvFactorySuite } from './cenv.command/cenv.command.factory.spec';
import { HelpCommandSuite, UnknownCommandSuite, VersionCommandSuite } from './cenv.command/cenv.command.spec';

// cenv
CenvFactorySuite.run();

// cenv --version
//VersionCommandSuite.run();

// cenv --help
HelpCommandSuite.run();

// cenv aoisdjfoijwfwf
UnknownCommandSuite.run();