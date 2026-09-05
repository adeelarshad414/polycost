import { Module } from '@nestjs/common';
import { CsvReportGenerator } from './csv-report.generator.js';
import { ExcelReportGenerator } from './excel-report.generator.js';
import { PdfReportGenerator } from './pdf-report.generator.js';
import { ReportService } from './report.service.js';

@Module({
  providers: [PdfReportGenerator, CsvReportGenerator, ExcelReportGenerator, ReportService],
  exports: [PdfReportGenerator, CsvReportGenerator, ExcelReportGenerator, ReportService],
})
export class ReportModule {}
