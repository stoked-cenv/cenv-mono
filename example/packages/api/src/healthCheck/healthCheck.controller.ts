import { Controller, Get } from '@nestjs/common';
import { HealthCheck } from '../models/healthCheck';
import { HealthCheckService } from './healthCheck.service';

@Controller('/')
export class HealthCheckController {
  constructor(private readonly healthCheckService: HealthCheckService) {}

  @Get('')
  async getHealthCheck(): Promise<HealthCheck> {
    return this.healthCheckService.getHealthCheck();
  }
}
