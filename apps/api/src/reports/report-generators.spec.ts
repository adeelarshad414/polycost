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
  requirements: {
    sourceType: 'structured_form',
    workloadName: 'Client portal',
    workloadType: 'web_app',
    regionPreference: 'us-east',
    serviceRequirements: [
      {
        serviceCategory: 'compute',
        serviceType: 'vm-compute',
        instanceType: 'balanced tier - 2 vCPU - 4GB',
        tier: 'balanced',
        region: 'us-east',
        az: '2 zones',
        quantity: 2,
        scaleParams: {
          scalingType: 'fixed',
        },
      },
    ],
  },
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
        daily: 2.33,
        weekly: 16.34,
        monthly: 71,
        quarterly: 213,
        yearly: 852,
      },
      pricingModels: [
        {
          model: 'on-demand',
          available: true,
          monthlyCostUsd: 71,
          hourlyCostUsd: 0.1,
        },
        {
          model: 'reserved-3yr',
          available: true,
          monthlyCostUsd: 42,
          hourlyCostUsd: 0.06,
          caveat: 'Three-year commitment.',
        },
      ],
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
        daily: 0.66,
        weekly: 4.6,
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
    const csv = new CsvReportGenerator()
      .generate(comparison, { interval: 'quarterly', pricingModel: 'reserved-3yr' })
      .toString('utf8');

    expect(csv).toContain('Comparison ID,comparison-123');
    expect(csv).toContain('Selected interval,Quarterly');
    expect(csv).toContain('Selected pricing model,Reserved 3-year');
    expect(csv).toContain('FinOps Summary');
    expect(csv).toContain('Executive recommendation,gcp is the current cost baseline');
    expect(csv).toContain('Decision confidence,Medium - 2/3 providers priced; 1 approximate mappings');
    expect(csv).toContain('Solution architect review');
    expect(csv).toContain('gcp requires service-equivalence');
    expect(csv).toContain('Architecture risk,Medium - validate provider coverage');
    expect(csv).toContain('Lowest monthly run rate,gcp $20');
    expect(csv).toContain('Annual avoidable spread,$612');
    expect(csv).toContain('Dominant cost driver,storage $20');
    expect(csv).toContain('Selected Pricing Scenario');
    expect(csv).toContain('aws,yes,126,42,0.06,Three-year commitment.');
    expect(csv).toContain('Normalized Service Requirements');
    expect(csv).toContain('compute,vm-compute,balanced tier - 2 vCPU - 4GB / balanced');
    expect(csv).toContain('Rate Math Evidence');
    expect(csv).toContain('aws,2.33,16.34,71,213,852');
    expect(csv).toContain("aws,compute,'=cmd(1)\\risky compute,no,60.8");
    expect(csv).toContain('"primary ""postgres"", managed"');
    expect(csv).toContain("azure,provider_pricing_failed,'+pricing temporarily unavailable");
  });

  it('creates a real XLSX package with matching totals and spreadsheet injection mitigation', () => {
    const xlsx = new ExcelReportGenerator().generate(comparison, {
      interval: 'quarterly',
      pricingModel: 'reserved-3yr',
    });
    const xlsxText = xlsx.toString('utf8');

    expect(xlsx.subarray(0, 2).toString('utf8')).toBe('PK');
    expect(xlsxText).toContain('[Content_Types].xml');
    expect(xlsxText).toContain('xl/workbook.xml');
    expect(xlsxText).toContain('xl/worksheets/sheet1.xml');
    expect(xlsxText).toContain('<sheet name="Comparison"');
    expect(xlsxText).toContain('FinOps Summary');
    expect(xlsxText).toContain('Executive recommendation');
    expect(xlsxText).toContain('Decision confidence');
    expect(xlsxText).toContain('Solution architect review');
    expect(xlsxText).toContain('Architecture risk');
    expect(xlsxText).toContain('Lowest monthly run rate');
    expect(xlsxText).toContain('Selected Pricing Scenario');
    expect(xlsxText).toContain('Normalized Service Requirements');
    expect(xlsxText).toContain('Rate Math Evidence');
    expect(xlsxText).toContain('<v>71</v>');
    expect(xlsxText).toContain('&apos;=cmd(1)\\risky compute');
    expect(xlsxText).toContain('&apos;+pricing temporarily unavailable');
  });

  it('creates a PDF report with matching totals and escaped interpolated text', () => {
    const pdf = new PdfReportGenerator().generate(
      {
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
      },
      { interval: 'quarterly', pricingModel: 'reserved-3yr' },
    );
    const pdfText = pdf.toString('utf8');

    expect(pdf.subarray(0, 8).toString('utf8')).toBe('%PDF-1.4');
    expect(pdfText).toContain('Comparison ID: comparison-123');
    expect(pdfText).toContain('Selected interval: Quarterly');
    expect(pdfText).toContain('Selected pricing model: Reserved 3-year');
    expect(pdfText).toContain('FinOps summary');
    expect(pdfText).toContain('Executive recommendation: gcp is the current cost baseline');
    expect(pdfText).toContain('Decision confidence: Medium');
    expect(pdfText).toContain('Solution architect review: gcp requires service-equivalence');
    expect(pdfText).toContain('Architecture risk: Medium');
    expect(pdfText).toContain('Lowest monthly run rate: gcp $20');
    expect(pdfText).toContain('aws: daily $2.33, weekly $16.34, monthly $71');
    expect(pdfText).toContain('Selected pricing scenario');
    expect(pdfText).toContain('Normalized service requirements');
    expect(pdfText).toContain('Rate math evidence');
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
