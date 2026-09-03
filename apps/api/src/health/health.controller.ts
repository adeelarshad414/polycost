import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { HealthService } from './health.service';

/** Minimal shape of the Fastify reply; avoids importing the platform type. */
interface StatusResponse {
  status(code: number): unknown;
}

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Readiness must answer with a STATUS CODE, not just a body.
   *
   * Kubernetes readiness probes look at the HTTP status and ignore the
   * payload, so returning 200 with '{"status":"degraded"}' marks a pod Ready
   * and sends it traffic while its database is unreachable. Verified against a
   * real cluster: with Postgres absent the endpoint answered 200 and the pod
   * was routed to.
   *
   * Liveness deliberately keeps returning 200 - the process is alive, and
   * restarting it cannot fix a dependency.
   */
  private async readiness(response?: StatusResponse) {
    const health = await this.healthService.getHealth();

    if (health.status !== 'ok') {
      response?.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return health;
  }

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
  getReadyHealth(@Res({ passthrough: true }) response?: StatusResponse) {
    return this.readiness(response);
  }

  @Get('api/v1/health/ready')
  getApiReadyHealth(@Res({ passthrough: true }) response?: StatusResponse) {
    return this.readiness(response);
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
