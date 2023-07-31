import { NestFactory } from '@nestjs/core';
import { LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ServerModule } from './server/server.module';

async function bootstrap() {
  const app = await NestFactory.create(ServerModule);
  const logger = app.get<LoggerService>(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger);

  await app.listen(3000);
}
bootstrap();