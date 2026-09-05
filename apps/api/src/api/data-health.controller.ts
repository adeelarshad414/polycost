import { Controller, Get, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema.js';
import { DataHealthResponse } from './api-errors.js';
import { ComparisonApplicationService } from './comparison-application.service.js';
import {
  ApiRateLimitService,
  requestIdentity,
  writeRateLimitHeaders,
} from './rate-limit.service.js';
import type { RateLimitHeaderResponse } from './rate-limit.service.js';

interface RequestLike {
  ip?: string;
  headers?: Record<string, unknown>;
}

@Controller('api/v1/data-health')
export class DataHealthController {
  constructor(
    private readonly comparisonApplicationService: ComparisonApplicationService,
    private readonly apiRateLimitService: ApiRateLimitService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  @Get()
  async getDataHealth(
    @Req() request?: RequestLike,
    @Res({ passthrough: true }) response?: RateLimitHeaderResponse,
  ): Promise<DataHealthResponse> {
    const state = await this.apiRateLimitService.consume(
      'data_health',
      requestIdentity(request ?? {}),
      this.configService.get('RATE_LIMIT_PUBLIC_READ_PER_MINUTE', { infer: true }),
    );
    writeRateLimitHeaders(response, state);

    return this.comparisonApplicationService.getDataHealth();
  }
}
