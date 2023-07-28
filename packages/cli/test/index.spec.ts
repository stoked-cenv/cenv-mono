process.env.ENV = 'test';
//import { BasicFactorySuite } from './commands/basic/basic.command.factory.spec';
//BasicFactorySuite.run();
import { CenvVersionFlagSuite } from './commands/cenv/cenv.command.spec';
//CenvHelpFlagSuite.run()
CenvVersionFlagSuite.run();
//UnknownCommandSuite.run();
/*
import {
  BooleanCommandSuite,
  NumberCommandSuite,
  StringCommandSuite,
  UnknownCommandSuite,
} from './commands/basic/basic.command.spec';

/*≈
BooleanCommandSuite.run();
NumberCommandSuite.run();
StringCommandSuite.run();
UnknownCommandSuite.run();
*/

//
//import { CenvHelpFlagSuite, CenvVersionFlagSuite, UnknownCommandSuite } from './commands/cenv/cenv.command.spec';
//CenvCommandSuite.run();
//CenvHelpFlagSuite.run();
/*
import {
  BooleanCommandSuite,
  NumberCommandSuite,
  VersionCommandSuite,
  UnknownCommandSuite,
} from './commands/config.command.spec';

NumberCommandSuite.run();
BooleanCommandSuite.run();
UnknownCommandSuite.run();
HelpSuite.run();

 */