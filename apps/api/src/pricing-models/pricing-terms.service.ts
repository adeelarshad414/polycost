import { Injectable } from '@nestjs/common';
import {
  PaymentOptionCode,
  PaymentOptionDefinition,
  PricingTermCode,
  PricingTermDefinition,
} from './pricing-models.types';

const TERMS: PricingTermDefinition[] = [
  {
    code: 'on_demand',
    label: 'On-demand',
    requiresPaymentOption: false,
    isEstimateOnly: false,
  },
  {
    code: 'reserved_1yr',
    label: 'Reserved (1-Year)',
    termMonths: 12,
    requiresPaymentOption: true,
    isEstimateOnly: false,
  },
  {
    code: 'reserved_3yr',
    label: 'Reserved (3-Year)',
    termMonths: 36,
    requiresPaymentOption: true,
    isEstimateOnly: false,
  },
  {
    code: 'savings_plan_1yr',
    label: 'Savings Plan / CUD (1-Year)',
    termMonths: 12,
    requiresPaymentOption: true,
    isEstimateOnly: false,
  },
  {
    code: 'savings_plan_3yr',
    label: 'Savings Plan / CUD (3-Year)',
    termMonths: 36,
    requiresPaymentOption: true,
    isEstimateOnly: false,
  },
  {
    code: 'spot_estimate',
    label: 'Spot estimate',
    requiresPaymentOption: false,
    isEstimateOnly: true,
  },
];

const PAYMENT_OPTIONS: PaymentOptionDefinition[] = [
  { code: 'no_upfront', label: 'No upfront' },
  { code: 'partial_upfront', label: 'Partial upfront' },
  { code: 'all_upfront', label: 'All upfront' },
  { code: 'n_a', label: 'Not applicable' },
];

@Injectable()
export class PricingTermsService {
  listTerms(): PricingTermDefinition[] {
    return TERMS;
  }

  getTerm(code: PricingTermCode): PricingTermDefinition {
    const term = TERMS.find((candidate) => candidate.code === code);

    if (!term) {
      throw new Error(`Unsupported pricing term ${code}`);
    }

    return term;
  }

  listPaymentOptions(termCode?: PricingTermCode): PaymentOptionDefinition[] {
    if (!termCode) {
      return PAYMENT_OPTIONS;
    }

    const term = this.getTerm(termCode);

    return term.requiresPaymentOption
      ? PAYMENT_OPTIONS.filter((option) => option.code !== 'n_a')
      : PAYMENT_OPTIONS.filter((option) => option.code === 'n_a');
  }

  getPaymentOption(code: PaymentOptionCode): PaymentOptionDefinition {
    const paymentOption = PAYMENT_OPTIONS.find((candidate) => candidate.code === code);

    if (!paymentOption) {
      throw new Error(`Unsupported payment option ${code}`);
    }

    return paymentOption;
  }

  defaultPaymentOption(termCode: PricingTermCode): PaymentOptionCode | undefined {
    return this.getTerm(termCode).requiresPaymentOption ? 'no_upfront' : undefined;
  }
}
