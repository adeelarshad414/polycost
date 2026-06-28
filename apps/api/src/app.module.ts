import { Module } from '@nestjs/common';
import { ComparisonModule } from './comparison/comparison.module';
import { AppConfigModule } from './config/app-config.module';
import { HealthController } from './health/health.controller';
import { NwsParserModule } from './nws-parser/nws-parser.module';
import { PricingEtlModule } from './pricing-etl/pricing-etl.module';

@Module({
  imports: [AppConfigModule, PricingEtlModule, NwsParserModule, ComparisonModule],
  controllers: [HealthController],
})
export class AppModule {}
