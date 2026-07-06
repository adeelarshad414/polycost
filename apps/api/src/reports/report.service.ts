import { Injectable } from '@nestjs/common';
import { ComparisonResult } from '../comparison/comparison.types';
import { CsvReportGenerator } from './csv-report.generator';
import { ExcelReportGenerator } from './excel-report.generator';
import { PdfReportGenerator } from './pdf-report.generator';
import { GeneratedReport, ReportFormat, ReportOptions } from './report.types';

@Injectable()
export class ReportService {
  constructor(
    private readonly pdfReportGenerator: PdfReportGenerator,
    private readonly csvReportGenerator: CsvReportGenerator,
    private readonly excelReportGenerator: ExcelReportGenerator,
  ) {}

  generate(result: ComparisonResult, format: ReportFormat, options: ReportOptions = {}): GeneratedReport {
    const metadata = reportMetadata(format);
    const enrichedOptions: ReportOptions = {
      ...options,
      generatedAt: options.generatedAt ?? new Date().toISOString(),
    };

    return {
      fileName: `polycost-comparison-${result.comparisonId}.${metadata.extension}`,
      contentType: metadata.contentType,
      content: this.generateContent(result, format, enrichedOptions),
    };
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
