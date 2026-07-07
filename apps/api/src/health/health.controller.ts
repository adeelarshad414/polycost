import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health/live')
  getLiveHealth() {
    return this.healthService.getLiveHealth();
  }

  @Get('api/v1/health/live')
  getApiLiveHealth() {
    return this.healthService.getLiveHealth();
  }

  @Get('health')
  getHealth() {
    return this.healthService.getHealth();
  }

  @Get('health/ready')
  getReadyHealth() {
    return this.healthService.getHealth();
  }

  @Get('api/v1/health/ready')
  getApiReadyHealth() {
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
