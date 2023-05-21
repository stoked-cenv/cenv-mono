#!/usr/bin/env node
import * as sms from 'source-map-support';
sms.install();

import { CommandFactory } from 'nest-commander';
import { CenvModule } from './cli'
import { Commands } from '@stoked-cenv/cenv-ui'
import {
  TimerModules,
  cleanup
} from '@stoked-cenv/cenv-lib';

Commands.module = CenvModule;

[`exit`, `SIGINT`, `SIGUSR1`, `SIGUSR2`, `uncaughtException`, `SIGTERM`].forEach((eventType, ) => {
  process.on(eventType, cleanup.bind(this, eventType));
})

async function bootstrap() {
  try {
    await CommandFactory.run(CenvModule);
    TimerModules.show();
  } catch (e) {
    console.error(e.message, e.stack);
  }
}

bootstrap();
