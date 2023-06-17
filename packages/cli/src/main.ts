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
  process.on(eventType, err => {
    cleanup.bind(this, eventType)
    if (err) {
      console.error(err);
    }
    process.exit(0);
  });
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
