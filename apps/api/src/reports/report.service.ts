import { Injectable } from '@nestjs/common';
import { ComparisonResult } from '../comparison/comparison.types';
import { CsvReportGenerator } from './csv-report.generator';
import { ExcelReportGenerator } from './excel-report.generator';
import { PdfReportGenerator } from './pdf-report.generator';
import { GeneratedReport, ReportFormat } from './report.types';

@Injectable()
export class ReportService {
  constructor(
    private readonly pdfReportGenerator: PdfReportGenerator,
    private readonly csvReportGenerator: CsvReportGenerator,
    private readonly excelReportGenerator: ExcelReportGenerator,
  ) {}

  generate(result: ComparisonResult, format: ReportFormat): GeneratedReport {
    const metadata = reportMetadata(format);

    return {
      fileName: `polycost-comparison-${result.comparisonId}.${metadata.extension}`,
      contentType: metadata.contentType,
      content: this.generateContent(result, format),
    };
  }

  private generateContent(result: ComparisonResult, format: ReportFormat): Buffer {
    if (format === 'pdf') {
      return this.pdfReportGenerator.generate(result);
    }

    if (format === 'csv') {
      return this.csvReportGenerator.generate(result);
    }

    return this.excelReportGenerator.generate(result);
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
