import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MessagesModule } from './messages/messages.module';
import { HealthCheckModule } from './healthCheck/healthCheck.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MessagesModule,
    HealthCheckModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
