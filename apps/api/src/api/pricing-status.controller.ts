import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminApiKeyGuard } from './admin-api-key.guard';
import { PricingStatusResponse } from './api-errors';
import { ComparisonApplicationService } from './comparison-application.service';
import { pricingCoverageResponse, PricingCoverageResponse } from './pricing-coverage';

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
