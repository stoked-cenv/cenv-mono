import { Module } from '@nestjs/common';
import { BasicCommand } from './commands/basic';
import { LogService } from './common/log.service';

@Module({
          providers: [BasicCommand, LogService],
        })
export class BasicModule {}
