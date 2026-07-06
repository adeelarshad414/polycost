import { Injectable } from '@nestjs/common';
import { ReportService } from '../reports/report.service';
import {
  GeneratedReport,
  ReportExportJobRecord,
  ReportExportJobResponse,
  ReportFormat,
  ReportOptions,
} from '../reports/report.types';
import { ApiNotFoundError, ApiValidationError } from './api-errors';
import { ApiDatabaseRepository } from './api-database.repository';
import { ComparisonApplicationService } from './comparison-application.service';

const MAX_EXPORT_ERROR_LENGTH = 1000;

@Injectable()
export class ReportExportJobsService {
  constructor(
    private readonly comparisonApplicationService: ComparisonApplicationService,
    private readonly apiDatabaseRepository: ApiDatabaseRepository,
    private readonly reportService: ReportService,
    private readonly now: () => Date = () => new Date(),
    private readonly scheduler: (task: () => void) => void = (task) => {
      setTimeout(task, 0);
    },
  ) {}

  async createExportJob(
    comparisonId: string,
    format: ReportFormat,
    options: ReportOptions = {},
  ): Promise<ReportExportJobResponse> {
    await this.comparisonApplicationService.getComparison(comparisonId);
    const job = await this.apiDatabaseRepository.createReportExportJob({
      comparisonId,
      format,
      interval: options.interval,
      pricingModel: options.pricingModel,
    });

    this.scheduler(() => {
      void this.processExportJob(comparisonId, job.jobId);
    });

    return toExportJobResponse(job);
  }

  async getExportJob(comparisonId: string, jobId: string): Promise<ReportExportJobResponse> {
    const job = await this.apiDatabaseRepository.getReportExportJob(comparisonId, jobId);

    if (!job) {
      throw new ApiNotFoundError(`Export job ${jobId} was not found`);
    }

    return toExportJobResponse(job);
  }

  async downloadExportJob(comparisonId: string, jobId: string): Promise<GeneratedReport> {
    const artifact = await this.apiDatabaseRepository.getReportExportJobArtifact(
      comparisonId,
      jobId,
    );

    if (!artifact) {
      const job = await this.apiDatabaseRepository.getReportExportJob(comparisonId, jobId);

      if (!job) {
        throw new ApiNotFoundError(`Export job ${jobId} was not found`);
      }

      if (job.status === 'failed') {
        throw new ApiValidationError(job.errorMessage ?? 'Export job failed');
      }

      throw new ApiValidationError('Export job is not complete yet');
    }

    if (
      artifact.job.status !== 'completed' ||
      !artifact.job.fileName ||
      !artifact.job.contentType
    ) {
      throw new ApiValidationError('Export job is not complete yet');
    }

    return {
      fileName: artifact.job.fileName,
      contentType: artifact.job.contentType,
      content: artifact.content,
    };
  }

  async processExportJob(comparisonId: string, jobId: string): Promise<void> {
    const job = await this.apiDatabaseRepository.getReportExportJob(comparisonId, jobId);

    if (!job || job.status === 'completed' || job.status === 'failed') {
      return;
    }

    await this.apiDatabaseRepository.markReportExportJobRunning(jobId, this.now().toISOString());

    try {
      const [snapshot, dataHealth] = await Promise.all([
        this.comparisonApplicationService.getComparison(comparisonId),
        this.comparisonApplicationService.getDataHealth(),
      ]);
      const report = this.reportService.generate(snapshot.resultSnapshot, job.format, {
        interval: job.interval,
        pricingModel: job.pricingModel,
        dataHealth,
      });
      await this.apiDatabaseRepository.completeReportExportJob(
        jobId,
        report,
        this.now().toISOString(),
      );
    } catch (error) {
      await this.apiDatabaseRepository.failReportExportJob(
        jobId,
        safeExportError(error),
        this.now().toISOString(),
      );
    }
  }
}

function toExportJobResponse(job: ReportExportJobRecord): ReportExportJobResponse {
  const baseUrl = `/api/v1/comparisons/${job.comparisonId}/export-jobs/${job.jobId}`;

  return {
    ...job,
    statusUrl: baseUrl,
    ...(job.status === 'completed' ? { downloadUrl: `${baseUrl}/download` } : {}),
  };
}

function safeExportError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown export generation failure';

  return message.slice(0, MAX_EXPORT_ERROR_LENGTH);
}
