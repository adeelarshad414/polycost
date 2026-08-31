import { Controller, Get, Header, Res } from '@nestjs/common';
import { MetricsService } from './metrics.service';

interface MetricsResponse {
  header(name: string, value: string): unknown;
}

@Controller()
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  /**
   * Prometheus scrape endpoint.
   *
   * Deliberately unauthenticated and outside /api/v1: scrapers do not carry
   * session tokens, and the payload is aggregate counters with no tenant data.
   * It should be reachable from the metrics network only, not the public
   * internet - see docs/KNOWN-ISSUES.md.
   */
  @Get('metrics')
  @Header('Cache-Control', 'no-store')
  async metrics(@Res({ passthrough: true }) response?: MetricsResponse): Promise<string> {
    response?.header('Content-Type', this.metricsService.contentType());

    return this.metricsService.render();
  }
}
