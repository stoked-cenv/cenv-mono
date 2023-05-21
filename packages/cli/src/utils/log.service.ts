import { Module } from '@nestjs/common';
import {
  utilities as nestWinstonModuleUtilities,
  WinstonModule,
} from 'nest-winston';
import * as winston from 'winston';

@Module({
  imports: [
    WinstonModule.forRoot({
      transports: [new winston.transports.Console({})],
      level: 'info',
      format: winston.format.json(),
      // other options
    }),
  ],
})
export class LogService {}
