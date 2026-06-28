import { Module } from '@nestjs/common';
import { CsvReportGenerator } from './csv-report.generator';
import { ExcelReportGenerator } from './excel-report.generator';
import { PdfReportGenerator } from './pdf-report.generator';
import { ReportService } from './report.service';

@Module({
  providers: [PdfReportGenerator, CsvReportGenerator, ExcelReportGenerator, ReportService],
  exports: [PdfReportGenerator, CsvReportGenerator, ExcelReportGenerator, ReportService],
})
export class ReportModule {}
