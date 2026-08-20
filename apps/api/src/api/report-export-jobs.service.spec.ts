import { ReportService } from '../reports/report.service';
import { GeneratedReport, ReportExportJobRecord } from '../reports/report.types';
import { ApiNotFoundError, ApiValidationError, DataHealthResponse } from './api-errors';
import { ApiDatabaseRepository, ComparisonSnapshot } from './api-database.repository';
import { ComparisonApplicationService } from './comparison-application.service';
import { ReportExportJobsService } from './report-export-jobs.service';

const comparisonId = '11111111-1111-4111-8111-111111111111';
const jobId = '66666666-6666-4666-8666-666666666666';

const snapshot: ComparisonSnapshot = {
  nwsSnapshot: {
    schemaVersion: '1.0',
    metadata: {
      sourceType: 'structured_form',
      createdAt: '2026-07-01T00:00:00.000Z',
    },
    workload: {
      type: 'web_app',
      region: {
        isDefault: true,
      },
    },
    compute: [],
    storage: [],
    database: [],
    network: {
      cdn: false,
      loadBalancer: false,
    },
    availability: {
      multiAz: false,
      multiRegion: false,
    },
  },
  resultSnapshot: {
    comparisonId,
    pricingAsOf: '2026-07-01T00:00:00.000Z',
    cheapestProviderId: 'aws',
    providers: [],
  },
};

const dataHealth: DataHealthResponse = {
  generatedAt: '2026-07-01T00:00:00.000Z',
  freshnessPolicyHours: 48,
  overallStatus: 'fresh',
  dataProvenance: 'live',
  usesNonLivePricing: false,
  alertCount: 0,
  alerts: [],
  providers: [
    {
      providerId: 'aws',
      status: 'success',
      freshness: 'fresh',
      provenance: 'live',
      ageHours: 1,
      recordsUpdated: 12,
      recordsRejected: 0,
      recordsSkipped: 0,
      message: 'Pricing cache refreshed 1h ago across 30 catalog rows and 18 current rate rows.',
      cache: {
        catalogRows: 30,
        currentRateRows: 18,
        ageHours: 1,
        freshness: 'fresh',
        syncStatusCounts: {
          success: 48,
          partial: 0,
          failed: 0,
        },
      },
    },
  ],
};

const pendingJob: ReportExportJobRecord = {
  jobId,
  comparisonId,
  format: 'pdf',
  interval: 'monthly',
  pricingModel: 'on-demand',
  status: 'pending',
  createdAt: '2026-07-01T00:00:00.000Z',
};

const completedJob: ReportExportJobRecord = {
  ...pendingJob,
  status: 'completed',
  fileName: 'polycost-comparison.pdf',
  contentType: 'application/pdf',
  startedAt: '2026-07-01T00:00:05.000Z',
  completedAt: '2026-07-01T00:00:10.000Z',
};

const report: GeneratedReport = {
  fileName: 'polycost-comparison.pdf',
  contentType: 'application/pdf',
  content: Buffer.from('pdf'),
};

describe('ReportExportJobsService', () => {
  it('creates a queued export job and schedules background generation', async () => {
    const scheduled: Array<() => void> = [];
    const comparisonApplicationService = comparisonServiceMock();
    const apiDatabaseRepository = repositoryMock({
      createReportExportJob: jest
        .fn<
          ReturnType<ApiDatabaseRepository['createReportExportJob']>,
          Parameters<ApiDatabaseRepository['createReportExportJob']>
        >()
        .mockResolvedValue(pendingJob),
    });
    const service = createService(comparisonApplicationService, apiDatabaseRepository, undefined, {
      scheduler: (task) => {
        scheduled.push(task);
      },
    });

    await expect(
      service.createExportJob(comparisonId, 'pdf', {
        interval: 'monthly',
        pricingModel: 'on-demand',
      }),
    ).resolves.toEqual({
      ...pendingJob,
      statusUrl: `/api/v1/comparisons/${comparisonId}/export-jobs/${jobId}`,
    });
    expect(comparisonApplicationService.getComparison).toHaveBeenCalledWith(comparisonId);
    expect(apiDatabaseRepository.createReportExportJob).toHaveBeenCalledWith({
      comparisonId,
      format: 'pdf',
      interval: 'monthly',
      pricingModel: 'on-demand',
    });
    expect(scheduled).toHaveLength(1);
  });

  it('generates and stores the report artifact for pending jobs', async () => {
    const apiDatabaseRepository = repositoryMock({
      getReportExportJob: jest
        .fn<
          ReturnType<ApiDatabaseRepository['getReportExportJob']>,
          Parameters<ApiDatabaseRepository['getReportExportJob']>
        >()
        .mockResolvedValue(pendingJob),
    });
    const reportService = reportServiceMock();
    const service = createService(undefined, apiDatabaseRepository, reportService);

    await service.processExportJob(comparisonId, jobId);

    expect(apiDatabaseRepository.markReportExportJobRunning).toHaveBeenCalledWith(
      jobId,
      '2026-07-01T00:00:00.000Z',
    );
    expect(reportService.generate).toHaveBeenCalledWith(snapshot.resultSnapshot, 'pdf', {
      interval: 'monthly',
      pricingModel: 'on-demand',
      dataHealth,
    });
    expect(apiDatabaseRepository.completeReportExportJob).toHaveBeenCalledWith(
      jobId,
      report,
      '2026-07-01T00:00:00.000Z',
    );
  });

  it('marks export jobs failed when report generation throws', async () => {
    const apiDatabaseRepository = repositoryMock({
      getReportExportJob: jest
        .fn<
          ReturnType<ApiDatabaseRepository['getReportExportJob']>,
          Parameters<ApiDatabaseRepository['getReportExportJob']>
        >()
        .mockResolvedValue(pendingJob),
    });
    const reportService = reportServiceMock();
    reportService.generate.mockImplementation(() => {
      throw new Error('template rendering failed');
    });
    const service = createService(undefined, apiDatabaseRepository, reportService);

    await service.processExportJob(comparisonId, jobId);

    expect(apiDatabaseRepository.failReportExportJob).toHaveBeenCalledWith(
      jobId,
      'template rendering failed',
      '2026-07-01T00:00:00.000Z',
    );
  });

  it('downloads completed artifacts and rejects missing or incomplete jobs', async () => {
    const apiDatabaseRepository = repositoryMock({
      getReportExportJobArtifact: jest
        .fn()
        .mockResolvedValueOnce({
          job: completedJob,
          content: report.content,
        })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined),
      getReportExportJob: jest
        .fn()
        .mockResolvedValueOnce({ ...pendingJob, status: 'running' })
        .mockResolvedValueOnce(undefined),
    });
    const service = createService(undefined, apiDatabaseRepository);

    await expect(service.downloadExportJob(comparisonId, jobId)).resolves.toEqual(report);
    await expect(service.downloadExportJob(comparisonId, jobId)).rejects.toBeInstanceOf(
      ApiValidationError,
    );
    await expect(service.downloadExportJob(comparisonId, jobId)).rejects.toBeInstanceOf(
      ApiNotFoundError,
    );
  });

  it('includes a download URL only after the job completes', async () => {
    const apiDatabaseRepository = repositoryMock({
      getReportExportJob: jest
        .fn()
        .mockResolvedValueOnce(pendingJob)
        .mockResolvedValueOnce(completedJob),
    });
    const service = createService(undefined, apiDatabaseRepository);

    await expect(service.getExportJob(comparisonId, jobId)).resolves.toEqual({
      ...pendingJob,
      statusUrl: `/api/v1/comparisons/${comparisonId}/export-jobs/${jobId}`,
    });
    await expect(service.getExportJob(comparisonId, jobId)).resolves.toEqual({
      ...completedJob,
      statusUrl: `/api/v1/comparisons/${comparisonId}/export-jobs/${jobId}`,
      downloadUrl: `/api/v1/comparisons/${comparisonId}/export-jobs/${jobId}/download`,
    });
  });
});

function createService(
  comparisonApplicationService = comparisonServiceMock(),
  apiDatabaseRepository = repositoryMock(),
  reportService = reportServiceMock(),
  options: {
    scheduler?: (task: () => void) => void;
  } = {},
): ReportExportJobsService {
  return new ReportExportJobsService(
    comparisonApplicationService,
    apiDatabaseRepository,
    reportService,
    () => new Date('2026-07-01T00:00:00.000Z'),
    options.scheduler ?? (() => undefined),
  );
}

function comparisonServiceMock(): jest.Mocked<ComparisonApplicationService> {
  return {
    getComparison: jest.fn(async () => snapshot),
    getDataHealth: jest.fn(async () => dataHealth),
  } as unknown as jest.Mocked<ComparisonApplicationService>;
}

function repositoryMock(
  overrides: Partial<jest.Mocked<ApiDatabaseRepository>> = {},
): jest.Mocked<ApiDatabaseRepository> {
  return {
    createReportExportJob: jest.fn(async () => pendingJob),
    getReportExportJob: jest.fn(async () => pendingJob),
    markReportExportJobRunning: jest.fn(async () => undefined),
    completeReportExportJob: jest.fn(async () => undefined),
    failReportExportJob: jest.fn(async () => undefined),
    getReportExportJobArtifact: jest.fn(async () => undefined),
    ...overrides,
  } as unknown as jest.Mocked<ApiDatabaseRepository>;
}

function reportServiceMock(): jest.Mocked<ReportService> {
  return {
    generate: jest.fn(() => report),
  } as unknown as jest.Mocked<ReportService>;
}
