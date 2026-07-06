import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  getHealth() {
    return this.healthService.getHealth();
  }

  @Get('health/deep')
  getDeepHealth() {
    return this.healthService.getDeepHealth();
  }

  @Get('api/v1/health/deep')
  getApiDeepHealth() {
    return this.healthService.getDeepHealth();
  }
}
