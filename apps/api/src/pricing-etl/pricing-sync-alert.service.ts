import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema.js';
import { PricingEtlProviderResult } from './pricing-etl.types.js';

export interface PricingSyncFailureNotifier {
  notifyProviderResult(result: PricingEtlProviderResult): Promise<void>;
}

@Injectable()
export class WebhookPricingSyncFailureNotifier implements PricingSyncFailureNotifier {
  private readonly logger = new Logger(WebhookPricingSyncFailureNotifier.name);

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  async notifyProviderResult(result: PricingEtlProviderResult): Promise<void> {
    if (result.status === 'success') {
      return;
    }

    const webhookUrl = this.configService.get('PRICING_SYNC_ALERT_WEBHOOK_URL', { infer: true });

    if (!webhookUrl) {
      this.logger.warn({
        event: 'pricing_sync_alert_not_configured',
        provider: result.provider,
        status: result.status,
        errorDetail: result.errorDetail,
      });
      return;
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          event: 'pricing_sync_issue',
          provider: result.provider,
          status: result.status,
          startedAt: result.startedAt,
          completedAt: result.completedAt,
          recordsUpdated: result.recordsUpdated,
          recordsRejected: result.recordsRejected,
          recordsSkipped: result.recordsSkipped,
          errorDetail: result.errorDetail,
        }),
      });

      if (!response.ok) {
        this.logger.error({
          event: 'pricing_sync_alert_delivery_failed',
          provider: result.provider,
          statusCode: response.status,
        });
      }
    } catch (error) {
      this.logger.error({
        event: 'pricing_sync_alert_delivery_failed',
        provider: result.provider,
        error: error instanceof Error ? error.message : 'Unknown webhook delivery failure',
      });
    }
  }
}
