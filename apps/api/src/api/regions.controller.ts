import { Controller, Get, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema.js';
import {
  ApiRateLimitService,
  requestIdentity,
  writeRateLimitHeaders,
} from './rate-limit.service.js';
import type { RateLimitHeaderResponse } from './rate-limit.service.js';
import { RegionCatalogResponse } from './regions.types.js';
import { RegionsService } from './regions.service.js';

interface RequestLike {
  ip?: string;
  headers?: Record<string, unknown>;
}

@Controller('api/v1/regions')
export class RegionsController {
  constructor(
    private readonly regionsService: RegionsService,
    private readonly apiRateLimitService: ApiRateLimitService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  @Get()
  async getRegions(
    @Req() request?: RequestLike,
    @Res({ passthrough: true }) response?: RateLimitHeaderResponse,
  ): Promise<RegionCatalogResponse> {
    const state = await this.apiRateLimitService.consume(
      'regions_catalog',
      requestIdentity(request ?? {}),
      this.configService.get('RATE_LIMIT_PUBLIC_READ_PER_MINUTE', { infer: true }),
    );
    writeRateLimitHeaders(response, state);

    return this.regionsService.getRegionCatalog();
  }
}
