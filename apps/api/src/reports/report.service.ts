import { Injectable, Optional } from '@nestjs/common';
import { ComparisonResult } from '../comparison/comparison.types.js';
import { CsvReportGenerator } from './csv-report.generator.js';
import { ExcelReportGenerator } from './excel-report.generator.js';
import { PdfReportGenerator } from './pdf-report.generator.js';
import { GeneratedReport, ReportFormat, ReportOptions } from './report.types.js';
import { DomainMetricsService } from '../observability/domain-metrics.service.js';

@Injectable()
export class ReportService {
  constructor(
    private readonly pdfReportGenerator: PdfReportGenerator,
    private readonly csvReportGenerator: CsvReportGenerator,
    private readonly excelReportGenerator: ExcelReportGenerator,
    @Optional() private readonly domainMetrics?: DomainMetricsService,
  ) {}

  generate(result: ComparisonResult, format: ReportFormat, options: ReportOptions = {}): GeneratedReport {
    const metadata = reportMetadata(format);
    const enrichedOptions: ReportOptions = {
      ...options,
      generatedAt: options.generatedAt ?? new Date().toISOString(),
    };

    // Timed around content generation only: that is where a large comparison
    // or a slow generator actually costs time, and a failure here is the one a
    // user sees as a broken download.
    const startedAt = process.hrtime.bigint();
    let outcome: 'success' | 'failure' = 'failure';

    try {
      const content = this.generateContent(result, format, enrichedOptions);
      outcome = 'success';

      return {
        fileName: `polycost-comparison-${result.comparisonId}.${metadata.extension}`,
        contentType: metadata.contentType,
        content,
      };
    } finally {
      this.domainMetrics?.recordExport({
        format,
        outcome,
        durationSeconds: Number(process.hrtime.bigint() - startedAt) / 1e9,
      });
    }
  }

  private generateContent(
    result: ComparisonResult,
    format: ReportFormat,
    options: ReportOptions,
  ): Buffer {
    if (format === 'pdf') {
      return this.pdfReportGenerator.generate(result, options);
    }

    if (format === 'csv') {
      return this.csvReportGenerator.generate(result, options);
    }

    return this.excelReportGenerator.generate(result, options);
  }
}

function reportMetadata(format: ReportFormat): { contentType: string; extension: string } {
  if (format === 'pdf') {
    return {
      contentType: 'application/pdf',
      extension: 'pdf',
    };
  }

  if (format === 'csv') {
    return {
      contentType: 'text/csv',
      extension: 'csv',
    };
  }

  return {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: 'xlsx',
  };
}
