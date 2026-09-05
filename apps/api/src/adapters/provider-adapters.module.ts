import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { DomainMetricsService } from '../observability/domain-metrics.service.js';
import { instrumentPool } from '../observability/instrumented-pool.js';
import { ConfigService } from '@nestjs/config';
import { AwsProviderAdapter } from './aws/aws-provider.adapter.js';
import { AzureProviderAdapter } from './azure/azure-provider.adapter.js';
import { CloudProviderAdapter } from './common/cloud-provider-adapter.js';
import { GcpProviderAdapter } from './gcp/gcp-provider.adapter.js';
import { createMockProviderAdapters } from './mock/mock-provider.adapter.js';
import { AppConfig } from '../config/config.schema.js';
import { PostgresPricingCatalogRepository } from '../database/pricing-catalog.repository.js';
import { SecretsService } from '../secrets/secrets.service.js';

export const CLOUD_PROVIDER_ADAPTERS = Symbol('CLOUD_PROVIDER_ADAPTERS');

@Module({
  providers: [
    SecretsService,
    {
      provide: PostgresPricingCatalogRepository,
      inject: [ConfigService, SecretsService, DomainMetricsService],
      useFactory: (
        configService: ConfigService<AppConfig, true>,
        secretsService: SecretsService,
        domainMetrics: DomainMetricsService,
      ) =>
        new PostgresPricingCatalogRepository(configService, secretsService, (config) =>
          instrumentPool(new Pool(config), domainMetrics, 'pricing_catalog'),
        ),
    },
    {
      provide: CLOUD_PROVIDER_ADAPTERS,
      inject: [PostgresPricingCatalogRepository, ConfigService, SecretsService],
      useFactory: (
        catalogRepository: PostgresPricingCatalogRepository,
        configService: ConfigService<AppConfig, true>,
        secretsService: SecretsService,
      ): CloudProviderAdapter[] => {
        const defaultRegions = {
          aws: configService.get('PRICING_ETL_DEFAULT_REGION_AWS', { infer: true }),
          azure: configService.get('PRICING_ETL_DEFAULT_REGION_AZURE', { infer: true }),
          gcp: configService.get('PRICING_ETL_DEFAULT_REGION_GCP', { infer: true }),
        };

        if (configService.get('USE_MOCK_PROVIDERS', { infer: true })) {
          return createMockProviderAdapters(catalogRepository, defaultRegions);
        }

        return [
          new AwsProviderAdapter(catalogRepository, defaultRegions.aws),
          new AzureProviderAdapter(catalogRepository, defaultRegions.azure),
          new GcpProviderAdapter(catalogRepository, defaultRegions.gcp, secretsService),
        ];
      },
    },
  ],
  exports: [CLOUD_PROVIDER_ADAPTERS, PostgresPricingCatalogRepository, SecretsService],
})
export class ProviderAdaptersModule {}
