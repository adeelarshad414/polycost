import { Global, Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller.js';
import { DomainMetricsService } from './domain-metrics.service.js';
import { MetricsService } from './metrics.service.js';
import { TracingLifecycle } from './tracing.lifecycle.js';
import { ErrorReporter } from './error-reporter.js';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/config.schema.js';

/**
 * Global so any provider can record a metric without importing the module.
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    MetricsService,
    DomainMetricsService,
    TracingLifecycle,
    {
      // Unlike tracing, this can be built from validated config: reporting
      // happens long after boot, so it does not need to precede module loading.
      provide: ErrorReporter,
      // Optional so the module still boots standalone (the DI regression tests
      // compile it on its own). No config means no DSN, which means reporting
      // is simply off - never a broken module.
      inject: [{ token: ConfigService, optional: true }],
      useFactory: (configService?: ConfigService<AppConfig, true>) =>
        new ErrorReporter({
          dsn: configService?.get('ERROR_TRACKING_DSN', { infer: true }),
          environment: configService?.get('NODE_ENV', { infer: true }),
        }),
    },
  ],
  exports: [MetricsService, DomainMetricsService, ErrorReporter],
})
export class ObservabilityModule {}
