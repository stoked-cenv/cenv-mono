process.env.ENV = 'test';
import { CenvVersionFlagSuite, CenvHelpFlagSuite } from './commands/cenv/cenv.command.spec';
CenvVersionFlagSuite.run();
CenvHelpFlagSuite.run()
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