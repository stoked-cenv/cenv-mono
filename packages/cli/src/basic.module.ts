import { Module } from '@nestjs/common';
import {BasicCommand} from './commands/basic.command';
import { CenvLog } from '@stoked-cenv/lib';

@Module({
          providers: [
            BasicCommand,
            CenvLog
          ],
        })
export class BasicModule {}
