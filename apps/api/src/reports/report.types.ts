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
  generatedAt?: string;
  dataHealth?: ReportDataHealthSnapshot;
}

export interface ReportDataHealthSnapshot {
  generatedAt: string;
  freshnessPolicyHours: number;
  overallStatus: 'fresh' | 'stale' | 'degraded';
  alertCount: number;
  providers: Array<{
    providerId: 'aws' | 'azure' | 'gcp';
    freshness: 'fresh' | 'stale' | 'missing' | 'failed';
    ageHours?: number;
    message: string;
    cache: {
      catalogRows: number;
      currentRateRows: number;
      ageHours?: number;
      freshness: 'fresh' | 'stale' | 'missing';
      syncStatusCounts: {
        success: number;
        partial: number;
        failed: number;
      };
    };
  }>;
}

export interface GeneratedReport {
  fileName: string;
  contentType: string;
  content: Buffer;
}

export type ReportExportJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ReportExportJobRecord {
  jobId: string;
  comparisonId: string;
  format: ReportFormat;
  interval?: ReportInterval;
  pricingModel?: ReportPricingModel;
  status: ReportExportJobStatus;
  fileName?: string;
  contentType?: string;
  errorMessage?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface ReportExportJobResponse extends ReportExportJobRecord {
  statusUrl: string;
  downloadUrl?: string;
}
