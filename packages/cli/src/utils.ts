#!/usr/bin/env node
import * as sms from 'source-map-support';
import {Module} from '@nestjs/common';
import {CommandFactory} from 'nest-commander';

sms.install();

@Module({
          providers: [],
        })
export class AppModule {
}

async function bootstrap() {
  try {
    await CommandFactory.run(AppModule);
  } catch (e) {
    console.error(e as string);
  }
}

bootstrap();
