// import dotenv from 'dotenv';
// dotenv.config();
import { startCenv, ClientMode } from '@stoked-cenv/lib';
import Server from './app';
import * as path from 'path';

async function bootstrap() {
  console.log('ENV at start: ' + JSON.stringify(process.env));
  await startCenv(ClientMode.REMOTE_POLLING, require(path.resolve('package.json')).name, '* * * * *');
  console.log('ENV after cenv: ' + JSON.stringify(process.env));

  process.on('SIGINT', function() {
    console.log('Caught interrupt signal');
    process.exit();
  });

  const serv: Server = new Server();
  await serv.start();
}
bootstrap();
