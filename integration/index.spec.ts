// CenvCommand
import { CenvFactorySuite } from './cenv/test/cenv.command.factory.spec';
CenvFactorySuite.run();
import {
  VersionCommandSuite,
  HelpCommandSuite,
} from './cenv/test/cenv.command.spec';
VersionCommandSuite.run();
HelpCommandSuite.run();