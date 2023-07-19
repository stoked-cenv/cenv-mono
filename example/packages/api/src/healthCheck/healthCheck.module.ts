import { Module } from '@nestjs/common';
import { HealthCheckController } from './healthCheck.controller';
import { HealthCheckService } from './healthCheck.service';

@Module({
  providers: [HealthCheckService],
  controllers: [HealthCheckController],
})
export class HealthCheckModule {}
