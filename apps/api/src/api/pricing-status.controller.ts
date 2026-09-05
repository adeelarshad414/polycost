import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminApiKeyGuard } from './admin-api-key.guard.js';
import { PricingStatusResponse } from './api-errors.js';
import { ComparisonApplicationService } from './comparison-application.service.js';
import { pricingCoverageResponse } from './pricing-coverage.js';
import type { PricingCoverageResponse } from './pricing-coverage.js';

@Controller('api/v1/pricing')
export class PricingStatusController {
  constructor(private readonly comparisonApplicationService: ComparisonApplicationService) {}

  @Get('coverage')
  getCoverage(): PricingCoverageResponse {
    return pricingCoverageResponse();
  }

  @Get('status')
  @UseGuards(AdminApiKeyGuard)
  async getStatus(): Promise<PricingStatusResponse> {
    return this.comparisonApplicationService.getPricingStatus();
  }
}
