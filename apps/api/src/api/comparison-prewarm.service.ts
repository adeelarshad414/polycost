import { Injectable } from '@nestjs/common';
import { ComparisonLineItem, ComparisonResult } from '../comparison/comparison.types.js';
import { PricingMatrixService } from '../pricing-models/pricing-matrix.service.js';
import {
  PaymentOptionCode,
  PricingGranularity,
  PricingTermCode,
} from '../pricing-models/pricing-models.types.js';
import { ApiDatabaseRepository, ComparisonPrewarmJobRecord } from './api-database.repository.js';

const MAX_PREWARM_ERROR_LENGTH = 1000;

const PREWARM_COMBINATIONS: PrewarmCombination[] = [
  { pricingModel: 'on_demand', granularity: 'monthly' },
  { pricingModel: 'on_demand', granularity: 'yearly' },
  { pricingModel: 'on_demand', granularity: 'hourly' },
  { pricingModel: 'reserved_1yr', paymentOption: 'no_upfront', granularity: 'monthly' },
  { pricingModel: 'reserved_3yr', paymentOption: 'no_upfront', granularity: 'monthly' },
  { pricingModel: 'reserved_3yr', paymentOption: 'no_upfront', granularity: 'yearly' },
  { pricingModel: 'savings_plan_1yr', paymentOption: 'no_upfront', granularity: 'monthly' },
  { pricingModel: 'spot_estimate', granularity: 'monthly' },
];

interface PrewarmCombination {
  pricingModel: PricingTermCode;
  paymentOption?: PaymentOptionCode;
  granularity: PricingGranularity;
}

export interface ComparisonPrewarmRequest extends PrewarmCombination {
  provider: ComparisonResult['providers'][number]['providerId'];
  service: string;
  region: string;
}

export interface ComparisonPrewarmSummary {
  comparisonId: string;
  requestedCombinations: number;
  warmedCombinations: number;
  failedCombinations: number;
  jobId?: string;
  errorMessage?: string;
}

@Injectable()
export class ComparisonPrewarmService {
  constructor(
    private readonly apiDatabaseRepository: ApiDatabaseRepository,
    private readonly pricingMatrixService: PricingMatrixService,
    private readonly now: () => Date = () => new Date(),
    private readonly scheduler: (task: () => void) => void = (task) => {
      setTimeout(task, 0);
    },
  ) {}

  enqueue(result: ComparisonResult): void {
    this.scheduler(() => {
      void this.processComparison(result).catch(() => undefined);
    });
  }

  async processComparison(result: ComparisonResult): Promise<ComparisonPrewarmSummary> {
    const requests = comparisonPrewarmRequests(result);

    if (requests.length === 0) {
      return {
        comparisonId: result.comparisonId,
        requestedCombinations: 0,
        warmedCombinations: 0,
        failedCombinations: 0,
      };
    }

    let job: ComparisonPrewarmJobRecord | undefined;
    let warmedCombinations = 0;
    let failedCombinations = 0;
    const errors: string[] = [];

    try {
      job = await this.apiDatabaseRepository.createComparisonPrewarmJob({
        comparisonId: result.comparisonId,
        requestedCombinations: requests.length,
      });
      await this.apiDatabaseRepository.markComparisonPrewarmJobRunning(
        job.jobId,
        this.now().toISOString(),
      );

      for (const request of requests) {
        try {
          await this.pricingMatrixService.resolveRate(request);
          warmedCombinations += 1;
        } catch (error) {
          failedCombinations += 1;

          if (errors.length < 3) {
            errors.push(safePrewarmError(error));
          }
        }
      }

      const errorMessage = errors.length > 0 ? errors.join(' | ') : undefined;
      const status = warmedCombinations === 0 && failedCombinations > 0 ? 'failed' : 'completed';

      await this.apiDatabaseRepository.finishComparisonPrewarmJob(job.jobId, {
        status,
        warmedCombinations,
        failedCombinations,
        completedAt: this.now().toISOString(),
        ...(errorMessage ? { errorMessage: errorMessage.slice(0, MAX_PREWARM_ERROR_LENGTH) } : {}),
      });

      return {
        comparisonId: result.comparisonId,
        jobId: job.jobId,
        requestedCombinations: requests.length,
        warmedCombinations,
        failedCombinations,
        ...(errorMessage ? { errorMessage } : {}),
      };
    } catch (error) {
      const errorMessage = safePrewarmError(error);

      if (job) {
        await this.apiDatabaseRepository.finishComparisonPrewarmJob(job.jobId, {
          status: 'failed',
          warmedCombinations,
          failedCombinations: requests.length - warmedCombinations,
          completedAt: this.now().toISOString(),
          errorMessage,
        });
      }

      return {
        comparisonId: result.comparisonId,
        ...(job ? { jobId: job.jobId } : {}),
        requestedCombinations: requests.length,
        warmedCombinations,
        failedCombinations: requests.length - warmedCombinations,
        errorMessage,
      };
    }
  }
}

export function comparisonPrewarmRequests(result: ComparisonResult): ComparisonPrewarmRequest[] {
  const requestsByKey = new Map<string, ComparisonPrewarmRequest>();

  for (const providerResult of result.providers) {
    const computeLineItems = providerResult.lineItems.filter(isPrewarmableComputeLineItem);

    for (const lineItem of computeLineItems) {
      if (!lineItem.region) {
        continue;
      }

      for (const combination of PREWARM_COMBINATIONS) {
        const request: ComparisonPrewarmRequest = {
          provider: providerResult.providerId,
          service: serviceSlugForLineItem(lineItem),
          region: lineItem.region,
          ...combination,
        };
        requestsByKey.set(prewarmRequestKey(request), request);
      }
    }
  }

  return Array.from(requestsByKey.values());
}

function isPrewarmableComputeLineItem(lineItem: ComparisonLineItem): boolean {
  return lineItem.category === 'compute' || lineItem.costComponent === 'compute';
}

function serviceSlugForLineItem(lineItem: ComparisonLineItem): string {
  const descriptor = `${lineItem.skuId ?? ''} ${lineItem.description}`.toLowerCase();

  if (descriptor.includes('memory') || /\br\d/.test(descriptor)) {
    return 'memory-optimized';
  }

  if (descriptor.includes('compute-optimized') || /\bc\d/.test(descriptor)) {
    return 'compute-optimized';
  }

  if (descriptor.includes('storage-optimized') || /\bi\d/.test(descriptor)) {
    return 'storage-optimized';
  }

  if (descriptor.includes('gpu') || descriptor.includes('accelerated')) {
    return 'accelerated-computing';
  }

  return 'compute';
}

function prewarmRequestKey(request: ComparisonPrewarmRequest): string {
  return [
    request.provider,
    request.service,
    request.region,
    request.pricingModel,
    request.paymentOption ?? 'n_a',
    request.granularity,
  ].join(':');
}

function safePrewarmError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown prewarm failure';

  return message.slice(0, MAX_PREWARM_ERROR_LENGTH);
}
