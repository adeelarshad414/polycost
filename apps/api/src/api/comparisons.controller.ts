import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema.js';
import { ReportService } from '../reports/report.service.js';
import { ReportFormat, ReportInterval, ReportPricingModel } from '../reports/report.types.js';
import { ApiValidationError } from './api-errors.js';
import { ComparisonAnalyticsService } from './comparison-analytics.service.js';
import {
  ComparisonApplicationService,
  CreateComparisonOptions,
} from './comparison-application.service.js';
import {
  ApiRateLimitService,
  requestIdentity,
  writeRateLimitHeaders,
} from './rate-limit.service.js';
import { ReportExportJobsService } from './report-export-jobs.service.js';

interface RequestLike {
  ip?: string;
  headers?: Record<string, unknown>;
}

interface HeaderResponse {
  header(name: string, value: string): void;
}

@Controller('api/v1/comparisons')
export class ComparisonsController {
  constructor(
    private readonly comparisonApplicationService: ComparisonApplicationService,
    private readonly reportService: ReportService,
    private readonly apiRateLimitService: ApiRateLimitService,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly reportExportJobsService: ReportExportJobsService,
    private readonly comparisonAnalyticsService: ComparisonAnalyticsService,
  ) {}

  @Post()
  async create(
    @Body() body: unknown,
    @Req() request?: RequestLike,
    @Res({ passthrough: true }) response?: HeaderResponse,
  ) {
    await this.consumeRateLimit(
      'comparison_create',
      request,
      response,
      'RATE_LIMIT_COMPARISON_PER_MINUTE',
    );
    const parsed = parseCreateComparisonRequest(body);

    return this.comparisonApplicationService.createComparison(parsed.nws, parsed.options);
  }

  @Get(':id')
  async get(
    @Param('id') comparisonId: string,
    @Req() request?: RequestLike,
    @Res({ passthrough: true }) response?: HeaderResponse,
  ) {
    await this.consumeRateLimit(
      'comparison_get',
      request,
      response,
      'RATE_LIMIT_PUBLIC_READ_PER_MINUTE',
    );
    const snapshot = await this.comparisonApplicationService.getComparison(comparisonId);

    return snapshot.resultSnapshot;
  }

  @Get(':id/evidence')
  async evidence(
    @Param('id') comparisonId: string,
    @Req() request?: RequestLike,
    @Res({ passthrough: true }) response?: HeaderResponse,
  ) {
    await this.consumeRateLimit(
      'comparison_evidence',
      request,
      response,
      'RATE_LIMIT_PUBLIC_READ_PER_MINUTE',
    );

    return this.comparisonApplicationService.getComparisonPricingEvidence(comparisonId);
  }

  @Get(':id/analytics')
  async analytics(
    @Param('id') comparisonId: string,
    @Req() request?: RequestLike,
    @Res({ passthrough: true }) response?: HeaderResponse,
  ) {
    await this.consumeRateLimit(
      'comparison_analytics',
      request,
      response,
      'RATE_LIMIT_PUBLIC_READ_PER_MINUTE',
    );
    const snapshot = await this.comparisonApplicationService.getComparison(comparisonId);

    return this.comparisonAnalyticsService.build(snapshot.resultSnapshot);
  }

  @Get(':id/export')
  async export(
    @Param('id') comparisonId: string,
    @Query('format') formatQuery: unknown,
    @Query('interval') intervalQuery: unknown,
    @Query('pricingModel') pricingModelQuery: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
    @Req() request?: RequestLike,
  ): Promise<StreamableFile> {
    await this.consumeRateLimit(
      'comparison_export',
      request,
      response,
      'RATE_LIMIT_EXPORT_PER_MINUTE',
    );
    const format = parseReportFormat(formatQuery);
    const options = {
      interval: parseReportInterval(intervalQuery),
      pricingModel: parseReportPricingModel(pricingModelQuery),
    };
    const [snapshot, dataHealth] = await Promise.all([
      this.comparisonApplicationService.getComparison(comparisonId),
      this.comparisonApplicationService.getDataHealth(),
    ]);
    const report = this.reportService.generate(snapshot.resultSnapshot, format, {
      ...options,
      dataHealth,
    });
    const fileName = report.fileName.replace(/"/g, '');
    const disposition = `attachment; filename="${fileName}"`;

    response.header('Content-Type', report.contentType);
    response.header('Content-Disposition', disposition);

    return new StreamableFile(report.content, {
      type: report.contentType,
      disposition,
      length: report.content.length,
    });
  }

  @Post(':id/export-jobs')
  async createExportJob(
    @Param('id') comparisonId: string,
    @Body() body: unknown,
    @Req() request?: RequestLike,
    @Res({ passthrough: true }) response?: HeaderResponse,
  ) {
    await this.consumeRateLimit(
      'comparison_export_job_create',
      request,
      response,
      'RATE_LIMIT_EXPORT_PER_MINUTE',
    );
    const parsed = parseCreateExportJobRequest(body);

    return this.reportExportJobsService.createExportJob(
      comparisonId,
      parsed.format,
      parsed.options,
    );
  }

  @Get(':id/export-jobs/:jobId')
  async getExportJob(
    @Param('id') comparisonId: string,
    @Param('jobId') jobId: string,
    @Req() request?: RequestLike,
    @Res({ passthrough: true }) response?: HeaderResponse,
  ) {
    await this.consumeRateLimit(
      'comparison_export_job_status',
      request,
      response,
      'RATE_LIMIT_PUBLIC_READ_PER_MINUTE',
    );

    return this.reportExportJobsService.getExportJob(comparisonId, jobId);
  }

  @Get(':id/export-jobs/:jobId/download')
  async downloadExportJob(
    @Param('id') comparisonId: string,
    @Param('jobId') jobId: string,
    @Res({ passthrough: true }) response: HeaderResponse,
    @Req() request?: RequestLike,
  ): Promise<StreamableFile> {
    await this.consumeRateLimit(
      'comparison_export_job_download',
      request,
      response,
      'RATE_LIMIT_EXPORT_PER_MINUTE',
    );
    const report = await this.reportExportJobsService.downloadExportJob(comparisonId, jobId);
    const fileName = report.fileName.replace(/"/g, '');
    const disposition = `attachment; filename="${fileName}"`;

    response.header('Content-Type', report.contentType);
    response.header('Content-Disposition', disposition);

    return new StreamableFile(report.content, {
      type: report.contentType,
      disposition,
      length: report.content.length,
    });
  }

  @Post(':id/refresh-live')
  async refreshLive(
    @Param('id') comparisonId: string,
    @Req() request: RequestLike,
    @Res({ passthrough: true }) response?: HeaderResponse,
  ) {
    const rateLimit = await this.apiRateLimitService.consume(
      'comparison_refresh_live',
      requestIdentity(request),
      this.configService.get('RATE_LIMIT_LIVE_REFRESH_PER_MINUTE', { infer: true }),
    );
    writeRateLimitHeaders(response, rateLimit);

    return this.comparisonApplicationService.refreshLiveComparison(
      comparisonId,
      this.configService.get('FEATURE_LIVE_PRICING_REFRESH_ENABLED', { infer: true }),
    );
  }

  private async consumeRateLimit(
    scope: string,
    request: RequestLike | undefined,
    response: HeaderResponse | undefined,
    configKey:
      | 'RATE_LIMIT_COMPARISON_PER_MINUTE'
      | 'RATE_LIMIT_EXPORT_PER_MINUTE'
      | 'RATE_LIMIT_PUBLIC_READ_PER_MINUTE',
  ): Promise<void> {
    const rateLimit = await this.apiRateLimitService.consume(
      scope,
      requestIdentity(request ?? {}),
      this.configService.get(configKey, { infer: true }),
    );
    writeRateLimitHeaders(response, rateLimit);
  }
}

function parseCreateComparisonRequest(body: unknown): {
  nws: unknown;
  options: CreateComparisonOptions;
} {
  if (!isRecord(body)) {
    throw new ApiValidationError('Comparison request body must be an object');
  }

  if (!('nws' in body)) {
    throw new ApiValidationError('nws is required', [
      {
        field: 'nws',
        issue: 'is required',
      },
    ]);
  }

  return {
    nws: body.nws,
    options: parseOptions(body.options),
  };
}

function parseOptions(value: unknown): CreateComparisonOptions {
  if (value === undefined) {
    return {};
  }

  if (!isRecord(value)) {
    throw new ApiValidationError('options must be an object', [
      {
        field: 'options',
        issue: 'must be an object',
      },
    ]);
  }

  return {
    ...(typeof value.useLivePricing === 'boolean' ? { useLivePricing: value.useLivePricing } : {}),
  };
}

function parseCreateExportJobRequest(body: unknown): {
  format: ReportFormat;
  options: {
    interval?: ReportInterval;
    pricingModel?: ReportPricingModel;
  };
} {
  if (!isRecord(body)) {
    throw new ApiValidationError('Export job request body must be an object');
  }

  return {
    format: parseReportFormat(body.format),
    options: {
      interval: parseReportInterval(body.interval),
      pricingModel: parseReportPricingModel(body.pricingModel),
    },
  };
}

function parseReportFormat(format: unknown): ReportFormat {
  if (format === 'pdf' || format === 'csv' || format === 'xlsx') {
    return format;
  }

  throw new ApiValidationError('format must be one of pdf, csv, or xlsx', [
    {
      field: 'format',
      issue: 'must be pdf, csv, or xlsx',
    },
  ]);
}

function parseReportInterval(interval: unknown): ReportInterval | undefined {
  if (interval === undefined) {
    return undefined;
  }

  if (
    interval === 'hourly' ||
    interval === 'daily' ||
    interval === 'weekly' ||
    interval === 'monthly' ||
    interval === 'quarterly' ||
    interval === 'yearly'
  ) {
    return interval;
  }

  throw new ApiValidationError('interval must be a supported report interval', [
    {
      field: 'interval',
      issue: 'must be hourly, daily, weekly, monthly, quarterly, or yearly',
    },
  ]);
}

function parseReportPricingModel(pricingModel: unknown): ReportPricingModel | undefined {
  if (pricingModel === undefined) {
    return undefined;
  }

  if (
    pricingModel === 'on-demand' ||
    pricingModel === 'reserved-1yr' ||
    pricingModel === 'reserved-3yr' ||
    pricingModel === 'savings-plan' ||
    pricingModel === 'spot'
  ) {
    return pricingModel;
  }

  throw new ApiValidationError('pricingModel must be a supported report pricing model', [
    {
      field: 'pricingModel',
      issue: 'must be on-demand, reserved-1yr, reserved-3yr, savings-plan, or spot',
    },
  ]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
