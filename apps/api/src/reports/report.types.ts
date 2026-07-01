export type ReportFormat = 'pdf' | 'csv' | 'xlsx';

export type ReportInterval = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export type ReportPricingModel =
  | 'on-demand'
  | 'reserved-1yr'
  | 'reserved-3yr'
  | 'savings-plan'
  | 'spot';

export interface ReportOptions {
  interval?: ReportInterval;
  pricingModel?: ReportPricingModel;
}

export interface GeneratedReport {
  fileName: string;
  contentType: string;
  content: Buffer;
}
