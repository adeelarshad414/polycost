import { Controller, Get } from '@nestjs/common';
import { RegionCatalogResponse } from './regions.types';
import { RegionsService } from './regions.service';

@Controller('api/v1/regions')
export class RegionsController {
  constructor(private readonly regionsService: RegionsService) {}

  @Get()
  async getRegions(): Promise<RegionCatalogResponse> {
    return this.regionsService.getRegionCatalog();
  }
}
