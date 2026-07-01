import { Controller, Get } from '@nestjs/common';
import { DataHealthResponse } from './api-errors';
import { ComparisonApplicationService } from './comparison-application.service';

@Controller('api/v1/data-health')
export class DataHealthController {
  constructor(private readonly comparisonApplicationService: ComparisonApplicationService) {}

  @Get()
  async getDataHealth(): Promise<DataHealthResponse> {
    return this.comparisonApplicationService.getDataHealth();
  }
}
