import { Module } from '@nestjs/common';
import {BasicCommand} from './commands/basic.command';
import CenvCommand from './commands/cenv.command';
import { CenvLog } from '@stoked-cenv/lib';

@Module({
          providers: [
            BasicCommand,
            CenvCommand,
            CenvLog
          ],
        })
export class BasicModule {}
