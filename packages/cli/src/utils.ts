#!/usr/bin/env node
import * as sms from 'source-map-support';
sms.install();

import { Module } from '@nestjs/common';
import { Command, CommandFactory, CommandRunner, Option } from 'nest-commander';

@Module({
  providers: [
  ],
})
export class AppModule {}

async function bootstrap() {
  try {
    await CommandFactory.run(AppModule);
  } catch (e) {
    console.error(e.message, e);
  }
}

bootstrap();
