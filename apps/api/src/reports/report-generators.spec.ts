import { ComparisonResult } from '../comparison/comparison.types';
import { CsvReportGenerator } from './csv-report.generator';
import { ExcelReportGenerator } from './excel-report.generator';
import { PdfReportGenerator } from './pdf-report.generator';
import { sanitizeSpreadsheetText } from './report-security';
import { ReportService } from './report.service';

const comparison: ComparisonResult = {
  comparisonId: 'comparison-123',
  pricingAsOf: '2026-06-29T00:00:00.000Z',
  cheapestProviderId: 'gcp',
  providers: [
    {
      providerId: 'aws',
      lineItems: [
        {
          category: 'compute',
          description: '=cmd(1)\\risky compute',
          isApproximate: false,
          baseMonthlyCostUsd: 60.8,
        },
        {
          category: 'database',
          description: 'primary "postgres", managed',
          isApproximate: true,
          baseMonthlyCostUsd: 10.2,
        },
      ],
      totals: {
        daily: 2.37,
        weekly: 16.59,
        monthly: 71,
        quarterly: 213,
        yearly: 852,
      },
    },
    {
      providerId: 'gcp',
      lineItems: [
        {
          category: 'storage',
          description: 'object storage',
          isApproximate: false,
          baseMonthlyCostUsd: 20,
        },
      ],
      totals: {
        daily: 0.67,
        weekly: 4.69,
        monthly: 20,
        quarterly: 60,
        yearly: 240,
      },
    },
  ],
  warnings: [
    {
      providerId: 'azure',
      code: 'provider_pricing_failed',
      message: '+pricing temporarily unavailable',
    },
  ],
};

describe('report generators', () => {
  it('creates a CSV report with matching totals and spreadsheet injection mitigation', () => {
    const csv = new CsvReportGenerator().generate(comparison).toString('utf8');

    expect(csv).toContain('Comparison ID,comparison-123');
    expect(csv).toContain('aws,2.37,16.59,71,213,852');
    expect(csv).toContain("aws,compute,'=cmd(1)\\risky compute,no,60.8");
    expect(csv).toContain('"primary ""postgres"", managed"');
    expect(csv).toContain("azure,provider_pricing_failed,'+pricing temporarily unavailable");
  });

  it('creates a real XLSX package with matching totals and spreadsheet injection mitigation', () => {
    const xlsx = new ExcelReportGenerator().generate(comparison);
    const xlsxText = xlsx.toString('utf8');

    expect(xlsx.subarray(0, 2).toString('utf8')).toBe('PK');
    expect(xlsxText).toContain('[Content_Types].xml');
    expect(xlsxText).toContain('xl/workbook.xml');
    expect(xlsxText).toContain('xl/worksheets/sheet1.xml');
    expect(xlsxText).toContain('<sheet name="Comparison"');
    expect(xlsxText).toContain('<v>71</v>');
    expect(xlsxText).toContain('&apos;=cmd(1)\\risky compute');
    expect(xlsxText).toContain('&apos;+pricing temporarily unavailable');
  });

  it('creates a PDF report with matching totals and escaped interpolated text', () => {
    const pdf = new PdfReportGenerator().generate({
      ...comparison,
      warnings: [
        ...(comparison.warnings ?? []),
        {
          code: 'provider_pricing_failed',
          message: 'general warning',
        },
      ],
      providers: [
        {
          ...comparison.providers[0],
          lineItems: [
            ...comparison.providers[0].lineItems,
            {
              category: 'network',
              description:
                'this is a deliberately long line item description that forces the pdf report generator to wrap text across multiple drawing commands cleanly',
              isApproximate: false,
              baseMonthlyCostUsd: 1.23,
            },
          ],
        },
        comparison.providers[1],
      ],
    });
    const pdfText = pdf.toString('utf8');

    expect(pdf.subarray(0, 8).toString('utf8')).toBe('%PDF-1.4');
    expect(pdfText).toContain('Comparison ID: comparison-123');
    expect(pdfText).toContain('aws: daily $2.37, weekly $16.59, monthly $71');
    expect(pdfText).toContain('=cmd\\(1\\)\\\\risky compute');
    expect(pdfText).toContain('general | provider_pricing_failed | general warning');
    expect(pdfText).toContain('this is a deliberately long line item description');
    expect(pdfText).toContain('xref');
    expect(pdfText).toContain('%%EOF');
  });

  it('creates a PDF report when there are no warnings', () => {
    const pdf = new PdfReportGenerator().generate({
      ...comparison,
      warnings: undefined,
    });

    expect(pdf.toString('utf8')).not.toContain('Warnings');
  });

  it('returns API export metadata from ReportService', () => {
    const service = new ReportService(
      new PdfReportGenerator(),
      new CsvReportGenerator(),
      new ExcelReportGenerator(),
    );

    expect(service.generate(comparison, 'pdf')).toEqual(
      expect.objectContaining({
        fileName: 'polycost-comparison-comparison-123.pdf',
        contentType: 'application/pdf',
      }),
    );
    expect(service.generate(comparison, 'csv')).toEqual(
      expect.objectContaining({
        fileName: 'polycost-comparison-comparison-123.csv',
        contentType: 'text/csv',
      }),
    );
    expect(service.generate(comparison, 'xlsx')).toEqual(
      expect.objectContaining({
        fileName: 'polycost-comparison-comparison-123.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );
  });

  it.each(['=x', '+x', '-x', '@x', '\tx', '\rx', '\nx'])(
    'sanitizes spreadsheet text that starts with %p',
    (value) => {
      expect(sanitizeSpreadsheetText(value)).toBe(`'${value}`);
    },
  );
});
