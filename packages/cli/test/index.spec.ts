CenvFiles.ENVIRONMENT = 'test';
process.env.CENV_DEFAULTS='true';

import { rmSync } from 'fs';
import { CenvFiles } from '@stoked-cenv/lib';

CenvFiles.setPaths();
rmSync(CenvFiles.PROFILE_PATH, {recursive: true});

import { CenvVersionFlagSuite, HelpUnknownCommandSuite } from './commands/cenv/cenv.command.spec';
import { ConfigCommandSuite, ConfigShowCommandSuite, ConfigViaEnvVarsSuite } from './commands/config/config.command.spec';

async function bootstrap() {
  await ConfigCommandSuite.run();
  await ConfigShowCommandSuite.run();
  await ConfigViaEnvVarsSuite.run();
  await CenvVersionFlagSuite.run();
  await HelpUnknownCommandSuite.run();
}
bootstrap();


//CenvHelpFlagSuite2.run()
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