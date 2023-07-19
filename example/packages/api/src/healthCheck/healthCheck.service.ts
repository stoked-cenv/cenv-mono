import { Injectable } from '@nestjs/common';
import { HealthCheck } from '../models/healthCheck';

@Injectable()
export class HealthCheckService {
  getHealthCheck = (): HealthCheck => {
    return {
      text: 'Great Success!!',
    };
  };
}
