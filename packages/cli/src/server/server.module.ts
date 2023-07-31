import { Module } from '@nestjs/common';
import { ServerService } from './services/server.service';
import { ServerController } from './server.controller';
import { LoggerConfigService } from './services/config/logger.config.service';
import { WinstonModule } from 'nest-winston';

@Module({
  imports: [WinstonModule.forRootAsync({
      useClass: LoggerConfigService,
    }),
  ],
  providers: [ServerService],
  controllers: [ServerController],
})
export class ServerModule {}
