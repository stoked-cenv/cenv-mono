// import dotenv from 'dotenv';
// dotenv.config();
import { startCenv, ClientMode } from '@stoked-cenv/lib';
import Server from './app';

async function bootstrap() {
  console.log('ENV at start: ' + JSON.stringify(process.env));
  await startCenv(ClientMode.REMOTE_POLLING, '* * * * *');
  console.log('ENV after cenv: ' + JSON.stringify(process.env));

  process.on('SIGINT', function() {
    console.log('Caught interrupt signal');
    process.exit();
  });

  const serv: Server = new Server();
  await serv.start();
}
bootstrap();
