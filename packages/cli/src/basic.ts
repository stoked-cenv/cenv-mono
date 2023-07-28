#!/usr/bin/env node
import * as sms from 'source-map-support';
import {CommandFactory} from 'nest-commander';
import {BasicModule} from './basic.module'
import {cleanup} from '@stoked-cenv/lib';

sms.install();


[`exit`, `SIGINT`, `SIGUSR1`, `SIGUSR2`, `uncaughtException`, `SIGTERM`].forEach(async (eventType,) => {
  process.on(eventType, err => {
    cleanup.bind(this, eventType, err, 500)
  });
})


async function bootstrap() {
  try {
    await CommandFactory.run(BasicModule);
  } catch (e) {
    console.error(e);
  }
}

bootstrap();
