import { ComparisonResult } from '../comparison/comparison.types';
import { CsvReportGenerator } from './csv-report.generator';
import { ExcelReportGenerator } from './excel-report.generator';
import { PdfReportGenerator } from './pdf-report.generator';
import {
  architectureOverviewRows,
  breakEvenSummaryRows,
  commitmentTcoRows,
  costCoverageMapRows,
  decisionSummaryRows,
  egressNetworkingDetailRows,
  egressTierBreakdownRows,
  labelForInterval,
  labelForPricingModel,
  lineItemEvidenceRows,
  methodologySourceRows,
  optimizationOpportunityRows,
  pricingModelAvailabilityRows,
  providerCostDetailRows,
  providerRankingRows,
  regionComparisonRows,
  reportAssumptionRows,
  reportCoverRows,
  selectedScenarioRows,
  serviceRequirementRows,
  skuMappingAppendixRows,
  workloadScopeRows,
} from './report-evidence';
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
    workloadProfile: {
      environment: 'production',
      commitmentPreferencePercent: 65,
      operatingSystem: 'linux',
      supportTier: 'business',
      usagePattern: {
        type: 'bursty',
        averageUtilizationPercent: 25,
      },
      dataResidency: {
        scope: 'eu',
        complianceLocked: true,
      },
      tags: [
        { key: 'team', value: 'platform' },
        { key: 'project', value: 'migration-q3' },
      ],
    },
    serviceRequirements: [
      {
        serviceCategory: 'compute',
        serviceType: 'vm-compute',
        instanceType: 'balanced general-purpose tier / x86 / shared tenancy - 2 vCPU - 4GB',
        tier: 'balanced',
        region: 'us-east',
        az: '2 zones',
        quantity: 2,
        scaleParams: {
          scalingType: 'fixed',
          instanceFamily: 'general-purpose',
          processorArchitecture: 'x86_64',
          tenancy: 'shared',
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
        {
          category: 'network',
          costComponent: 'egress',
          description: 'internet egress',
          isApproximate: false,
          baseMonthlyCostUsd: 46.08,
          region: 'us-east-1',
          unit: 'GB',
          unitPriceUsd: 0.09,
          pricingBasis: 'tiered',
          egressTiers: [
            {
              tierFromGb: 0,
              tierToGb: 512,
              pricePerGb: 0.09,
              billableGb: 512,
              monthlyCostUsd: 46.08,
            },
          ],
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
          upfrontOption: 'all',
          upfrontCostUsd: 360,
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
      .generate(comparison, {
        interval: 'quarterly',
        pricingModel: 'reserved-3yr',
        generatedAt: '2026-07-02T00:00:00.000Z',
      })
      .toString('utf8');

    expect(csv).toContain('Comparison ID,comparison-123');
    expect(csv).toContain('Generated at,2026-07-02T00:00:00.000Z');
    expect(csv).toContain(
      'Data freshness notice,Pricing data as of 2026-06-29T00:00:00.000Z; refresh cached pricing before final commitment.',
    );
    expect(csv).toContain('Cheapest provider (on-demand baseline),gcp');
    expect(csv).toContain('Selected interval,Quarterly');
    expect(csv).toContain('Selected pricing model,Reserved 3-year');
    expect(csv).toContain('Decision Summary');
    expect(csv).toContain(
      'Cost baseline,aws ranks #1 for Reserved 3-year at $126 quarterly / $42 monthly.',
    );
    expect(csv).toContain(
      'Evidence confidence,"Review required - 2/3 providers priced, 1 approximate mapping(s), 1 warning(s)."',
    );
    expect(csv).toContain('Provider Ranking');
    expect(csv).toContain('aws,#1,yes,126,42,504,0,0,1,Three-year commitment.');
    expect(csv).toContain('gcp,Not eligible,no,,,,,,0,Not available for this SKU/region.');
    expect(csv).toContain('Workload Scope');
    expect(csv).toContain('Workload name,Client portal');
    expect(csv).toContain('Architecture Overview');
    expect(csv).toContain('AWS mapping,Azure mapping,GCP mapping');
    expect(csv).toContain('compute/vm-compute');
    expect(csv).toContain('FinOps Summary');
    expect(csv).toContain('Executive recommendation,gcp is the current cost baseline');
    expect(csv).toContain('Decision confidence,Medium - 2/3 providers priced; 1 approximate mappings');
    expect(csv).toContain('Solution architect review');
    expect(csv).toContain('gcp requires service-equivalence');
    expect(csv).toContain('Architecture risk,Medium - validate provider coverage');
    expect(csv).toContain('Lowest monthly run rate,gcp $20');
    expect(csv).toContain('Annual avoidable spread,$612');
    expect(csv).toContain('Dominant cost driver,storage $20');
    expect(csv).toContain('Provider Cost Detail');
    expect(csv).toContain('Provider total,aws,all,all,aws monthly total');
    expect(csv).toContain('Category subtotal,aws,network,egress,network / egress subtotal');
    expect(csv).toContain('Cost Coverage Map');
    expect(csv).toContain('aws,Compute families and sizing,Covered,1,0,60.8');
    expect(csv).toContain('Selected Pricing Scenario');
    expect(csv).toContain('aws,yes,126,42,0.06,Three-year commitment.');
    expect(csv).toContain('Pricing Model Availability');
    expect(csv).toContain(
      'gcp,available,not modeled,not modeled,not modeled,not modeled,Only on-demand totals are modeled for this provider.',
    );
    expect(csv).toContain('Commitment Payment and TCO');
    expect(csv).toContain('aws,Reserved 3-year,yes,0.06,42,360,All upfront,36 months,1872');
    expect(csv).toContain('Egress Tiered Breakdown');
    expect(csv).toContain('aws,us-east-1,0-512 GB,512,0.09,46.08,0.09');
    expect(csv).toContain('Egress & Networking Detail');
    expect(csv).toContain('aws,egress,internet egress,us-east-1,46.08');
    expect(csv).toContain('Optimization Opportunities');
    expect(csv).toContain('Commitment coverage,aws Reserved 3-year lowers recurring run rate;');
    expect(csv).toContain('Region Comparison');
    expect(csv).toContain('aws,eu-west,eu-west-1,76.68,5.68,1.08');
    expect(csv).toContain('Break-Even Analysis');
    expect(csv).toContain('aws,Reserved 3-year,71,42,360,29,13,Three-year commitment.');
    expect(csv).toContain('Normalized Service Requirements');
    expect(csv).toContain(
      'compute,vm-compute,balanced general-purpose tier / x86 / shared tenancy - 2 vCPU - 4GB / balanced',
    );
    expect(csv).toContain('Rate Math Evidence');
    expect(csv).toContain('Methodology & Data Sources');
    expect(csv).toContain('Provider catalog APIs');
    expect(csv).toContain('AWS Price List bulk offer files');
    expect(csv).toContain('SKU Mapping Appendix');
    expect(csv).toContain('Resolved SKU');
    expect(csv).toContain('Report Assumptions');
    expect(csv).toContain(
      'Pricing source,Cached provider catalog rates with 1 warning(s) captured in this export.',
    );
    expect(csv).toContain('aws,2.33,16.34,71,213,852');
    expect(csv).toContain("aws,compute,'=cmd(1)\\risky compute,no,60.8");
    expect(csv).toContain('"primary ""postgres"", managed"');
    expect(csv).toContain("azure,provider_pricing_failed,'+pricing temporarily unavailable");
  });

  it('creates a default CSV report without warnings when none are present', () => {
    const csv = new CsvReportGenerator()
      .generate({
        ...comparison,
        requirements: undefined,
        warnings: undefined,
      })
      .toString('utf8');

    expect(csv).toContain('Selected interval,Monthly');
    expect(csv).toContain('Selected pricing model,On-demand');
    expect(csv).toContain('No normalized service requirements were attached to this comparison.');
    expect(csv).not.toContain('Warnings');
  });

  it('creates CSV warning rows for general warnings without provider IDs', () => {
    const csv = new CsvReportGenerator()
      .generate({
        ...comparison,
        warnings: [
          {
            code: 'live_refresh_failed',
            message: '@refresh unavailable',
          },
        ],
      })
      .toString('utf8');

    expect(csv).toContain("Warnings\nProvider,Code,Message\n,live_refresh_failed,'@refresh unavailable");
  });

  it('creates a real XLSX package with matching totals and spreadsheet injection mitigation', () => {
    const xlsx = new ExcelReportGenerator().generate(comparison, {
      interval: 'quarterly',
      pricingModel: 'reserved-3yr',
      generatedAt: '2026-07-02T00:00:00.000Z',
    });
    const xlsxText = xlsx.toString('utf8');

    expect(xlsx.subarray(0, 2).toString('utf8')).toBe('PK');
    expect(xlsxText).toContain('[Content_Types].xml');
    expect(xlsxText).toContain('xl/workbook.xml');
    expect(xlsxText).toContain('xl/worksheets/sheet1.xml');
    expect(xlsxText).toContain('xl/worksheets/sheet2.xml');
    expect(xlsxText).toContain('<sheet name="Comparison"');
    expect(xlsxText).toContain('<sheet name="What If" sheetId="2"');
    expect(xlsxText).toContain('<sheet name="Architecture Overview" sheetId="3"');
    expect(xlsxText).toContain('<sheet name="Provider Cost Detail" sheetId="4"');
    expect(xlsxText).toContain('<sheet name="Cost Coverage Map" sheetId="5"');
    expect(xlsxText).toContain('<sheet name="Optimization Opportunities" sheetId="6"');
    expect(xlsxText).toContain('<sheet name="Egress &amp; Networking Detail" sheetId="7"');
    expect(xlsxText).toContain('<sheet name="Region Comparison" sheetId="8"');
    expect(xlsxText).toContain('<sheet name="Break-Even Analysis" sheetId="9"');
    expect(xlsxText).toContain('<sheet name="Break-Even Summary" sheetId="10"');
    expect(xlsxText).toContain('<sheet name="Methodology &amp; Sources" sheetId="11"');
    expect(xlsxText).toContain('<sheet name="SKU Mapping Appendix" sheetId="12"');
    expect(xlsxText).toContain('<calcPr calcMode="auto" fullCalcOnLoad="1"/>');
    expect(xlsxText).toContain(
      '<definedName name="WhatIfScaleFactor">&apos;What If&apos;!$B$5</definedName>',
    );
    expect(xlsxText).toContain(
      '<definedName name="WhatIfRegionMultiplier">&apos;What If&apos;!$B$6</definedName>',
    );
    expect(xlsxText).toContain(
      '<definedName name="BreakEvenOnDemandMultiplier">&apos;Break-Even Analysis&apos;!$B$5</definedName>',
    );
    expect(xlsxText).toMatch(
      /<definedName name="ComparisonMonthlyTotals">&apos;Comparison&apos;!\$D\$\d+:\$D\$\d+<\/definedName>/,
    );
    expect(xlsxText).toContain(
      '<definedName name="WhatIfScenarioMonthlyTotals">&apos;What If&apos;!$E$11:$E$11</definedName>',
    );
    expect(xlsxText).toContain(
      '<definedName name="WhatIfMonthlyDeltas">&apos;What If&apos;!$G$11:$G$11</definedName>',
    );
    expect(xlsxText).toContain('Decision Summary');
    expect(xlsxText).toContain('Cost baseline');
    expect(xlsxText).toContain('Provider Ranking');
    expect(xlsxText).toContain('Selected model eligible');
    expect(xlsxText).toContain('Workload Scope');
    expect(xlsxText).toContain('Generated at');
    expect(xlsxText).toContain('2026-07-02T00:00:00.000Z');
    expect(xlsxText).toContain('Data freshness notice');
    expect(xlsxText).toContain('Architecture Overview');
    expect(xlsxText).toContain('AWS mapping');
    expect(xlsxText).toContain('compute/vm-compute');
    expect(xlsxText).toContain('Provider Cost Detail');
    expect(xlsxText).toContain('Provider total');
    expect(xlsxText).toContain('Category subtotal');
    expect(xlsxText).toContain('Cost Coverage Map');
    expect(xlsxText).toContain('Compute families and sizing');
    expect(xlsxText).toContain('FinOps Summary');
    expect(xlsxText).toContain('Executive recommendation');
    expect(xlsxText).toContain('Decision confidence');
    expect(xlsxText).toContain('Solution architect review');
    expect(xlsxText).toContain('Architecture risk');
    expect(xlsxText).toContain('Lowest monthly run rate');
    expect(xlsxText).toContain('Selected Pricing Scenario');
    expect(xlsxText).toContain('Pricing Model Availability');
    expect(xlsxText).toContain('Commitment Payment and TCO');
    expect(xlsxText).toContain('Upfront cash USD');
    expect(xlsxText).toContain('<t>360</t>');
    expect(xlsxText).toContain('<t>1872</t>');
    expect(xlsxText).toContain('Egress Tiered Breakdown');
    expect(xlsxText).toContain('Optimization Opportunities');
    expect(xlsxText).toContain('Egress &amp; Networking Detail');
    expect(xlsxText).toContain('Region Comparison');
    expect(xlsxText).toContain('PolyCost Break-Even Analysis');
    expect(xlsxText).toContain('<f>D9*C9*BreakEvenOnDemandMultiplier</f><v>0</v>');
    expect(xlsxText).toContain('<f>F9+E9*C9</f><v>360</v>');
    expect(xlsxText).toContain('<f>IF(H9&lt;=G9,1,0)</f><v>0</v>');
    expect(xlsxText).toContain('Normalized Service Requirements');
    expect(xlsxText).toContain('Rate Math Evidence');
    expect(xlsxText).toContain('Methodology &amp; Data Sources');
    expect(xlsxText).toContain('Provider catalog APIs');
    expect(xlsxText).toContain('SKU Mapping Appendix');
    expect(xlsxText).toContain('Resolved SKU');
    expect(xlsxText).toContain('Report Assumptions');
    expect(xlsxText).toContain('<v>71</v>');
    expect(xlsxText).toContain('PolyCost What-If Model');
    expect(xlsxText).toContain('Editable assumption');
    expect(xlsxText).toContain('<f>WhatIfScaleFactor</f><v>1.25</v>');
    expect(xlsxText).toContain('<f>WhatIfRegionMultiplier</f><v>1</v>');
    expect(xlsxText).toContain('<f>B11*C11*D11</f><v>52.5</v>');
    expect(xlsxText).toContain('<f>SUM(WhatIfScenarioMonthlyTotals)</f><v>52.5</v>');
    expect(xlsxText).toContain('<f>SUM(WhatIfMonthlyDeltas)</f><v>10.5</v>');
    expect(xlsxText).toContain('&apos;=cmd(1)\\risky compute');
    expect(xlsxText).toContain('&apos;+pricing temporarily unavailable');
  });

  it('keeps the XLSX what-if sheet valid when no provider supports the selected scenario', () => {
    const xlsx = new ExcelReportGenerator().generate(
      {
        ...comparison,
        providers: comparison.providers.map((provider) => ({
          ...provider,
          pricingModels: undefined,
        })),
      },
      {
        pricingModel: 'savings-plan',
      },
    );
    const xlsxText = xlsx.toString('utf8');

    expect(xlsxText).toContain('PolyCost What-If Model');
    expect(xlsxText).toContain('No provider has an eligible selected pricing model');
    expect(xlsxText).toContain('<f>0</f><v>0</v>');
    expect(xlsxText).not.toContain('WhatIfScenarioMonthlyTotals');
    expect(xlsxText).not.toContain('WhatIfMonthlyDeltas');
    expect(xlsxText).toContain(
      '<definedName name="WhatIfScaleFactor">&apos;What If&apos;!$B$5</definedName>',
    );
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
      {
        interval: 'quarterly',
        pricingModel: 'reserved-3yr',
        generatedAt: '2026-07-02T00:00:00.000Z',
      },
    );
    const pdfText = pdf.toString('utf8');

    expect(pdf.subarray(0, 8).toString('utf8')).toBe('%PDF-1.4');
    expect(pdfText).toContain('Comparison ID: comparison-123');
    expect(pdfText).toContain('Generated at: 2026-07-02T00:00:00.000Z');
    expect(pdfText).toContain('Data freshness notice: Pricing data as of');
    expect(pdfText).toContain('Cheapest provider \\(on-demand baseline\\): gcp');
    expect(pdfText).toContain('Selected interval: Quarterly');
    expect(pdfText).toContain('Selected pricing model: Reserved 3-year');
    expect(pdfText).toContain('Decision summary');
    expect(pdfText).toContain('Cost baseline: aws ranks #1 for Reserved 3-year');
    expect(pdfText).toContain('Provider ranking');
    expect(pdfText).toContain('aws | #1 | eligible yes | selected $126');
    expect(pdfText).toContain('Workload scope');
    expect(pdfText).toContain('Architecture overview');
    expect(pdfText).toContain('compute | compute/vm-compute');
    expect(pdfText).toContain('FinOps summary');
    expect(pdfText).toContain('Executive recommendation: gcp is the current cost baseline');
    expect(pdfText).toContain('Decision confidence: Medium');
    expect(pdfText).toContain('Solution architect review: gcp requires service-equivalence');
    expect(pdfText).toContain('Architecture risk: Medium');
    expect(pdfText).toContain('Lowest monthly run rate: gcp $20');
    expect(pdfText).toContain('aws: daily $2.33, weekly $16.34, monthly $71');
    expect(pdfText).toContain('Provider cost detail');
    expect(pdfText).toContain('Provider total | aws | all / all | monthly $71');
    expect(pdfText).toContain('Cost coverage map');
    expect(pdfText).toContain('aws | Compute families and sizing | Covered');
    expect(pdfText).toContain('Selected pricing scenario');
    expect(pdfText).toContain('Pricing model availability');
    expect(pdfText).toContain('Commitment payment and TCO');
    expect(pdfText).toContain('upfront $360');
    expect(pdfText).toContain('Egress tiered breakdown');
    expect(pdfText).toContain('aws | us-east-1 | 0-512 GB | billable 512 GB');
    expect(pdfText).toContain('Egress and networking detail');
    expect(pdfText).toContain('aws | egress | internet egress | monthly $46.08');
    expect(pdfText).toContain('Optimization opportunities');
    expect(pdfText).toContain('Commitment coverage | aws Reserved 3-year lowers recurring run rate');
    expect(pdfText).toContain('Region comparison');
    expect(pdfText).toContain('aws | eu-west \\(eu-west-1\\) | modeled monthly $76.68');
    expect(pdfText).toContain('Break-even analysis');
    expect(pdfText).toContain('aws | Reserved 3-year | on-demand $71/mo | committed $42/mo');
    expect(pdfText).toContain('Normalized service requirements');
    expect(pdfText).toContain('Rate math evidence');
    expect(pdfText).toContain('Methodology and data sources');
    expect(pdfText).toContain('Provider catalog APIs');
    expect(pdfText).toContain('SKU mapping appendix');
    expect(pdfText).toContain('Report assumptions');
    expect(pdfText).toContain('=cmd\\(1\\)\\\\risky compute');
    expect(pdfText).toContain('general | provider_pricing_failed | general warning');
    expect(pdfText).toContain('this is a deliberately long line item description');
    expect(pdfText).toContain('PolyCost Visual Decision Deck');
    expect(pdfText).toContain('Provider monthly run-rate chart');
    expect(pdfText).toContain('Engineering Cost Evidence Deck');
    expect(pdfText).toContain('Service mix stacked chart');
    expect(pdfText).toContain('$71 monthly');
    expect(pdfText).toContain('Line-item source: same evidence rows used by CSV and XLSX exports');
    expect(pdfText).toContain(' re f');
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

  it('keeps the PDF requirement fallback when workload requirements are absent', () => {
    const pdf = new PdfReportGenerator().generate({
      ...comparison,
      requirements: undefined,
      warnings: undefined,
    });

    expect(pdf.toString('utf8')).toContain(
      'No normalized service requirements were attached to this comparison.',
    );
  });

  it('builds decision summary, ranking, availability, assumptions, and workload scope rows', () => {
    expect(decisionSummaryRows(comparison, { interval: 'quarterly', pricingModel: 'reserved-3yr' })).toEqual(
      expect.arrayContaining([
        [
          'Cost baseline',
          'aws ranks #1 for Reserved 3-year at $126 quarterly / $42 monthly.',
        ],
        [
          'Evidence confidence',
          'Review required - 2/3 providers priced, 1 approximate mapping(s), 1 warning(s).',
        ],
      ]),
    );

    expect(providerRankingRows(comparison, { interval: 'quarterly', pricingModel: 'reserved-3yr' })).toEqual(
      expect.arrayContaining([
        ['aws', '#1', 'yes', '126', '42', '504', '0', '0', '1', 'Three-year commitment.'],
        ['gcp', 'Not eligible', 'no', '', '', '', '', '', '0', 'Not available for this SKU/region.'],
      ]),
    );

    expect(pricingModelAvailabilityRows(comparison)).toEqual(
      expect.arrayContaining([
        [
          'gcp',
          'available',
          'not modeled',
          'not modeled',
          'not modeled',
          'not modeled',
          'Only on-demand totals are modeled for this provider.',
        ],
      ]),
    );

    expect(reportAssumptionRows(comparison)).toEqual(
      expect.arrayContaining([
        ['Pricing source', 'Cached provider catalog rates with 1 warning(s) captured in this export.'],
        [
          'Approximate mappings',
          '1 line item(s) are approximate and should be reviewed by a solution architect before commitment.',
        ],
      ]),
    );

    expect(
      reportCoverRows(comparison, {
        interval: 'quarterly',
        pricingModel: 'reserved-3yr',
        generatedAt: '2026-07-02T00:00:00.000Z',
      }),
    ).toEqual(
      expect.arrayContaining([
        ['Generated at', '2026-07-02T00:00:00.000Z'],
        ['Provider coverage', '2/2 providers priced'],
        ['Line-item evidence', '4 line item(s), 1 approximate'],
      ]),
    );

    expect(architectureOverviewRows(comparison)).toEqual(
      expect.arrayContaining([
        [
          'compute',
          expect.stringContaining('compute/vm-compute'),
          expect.stringContaining('risky compute'),
          'Not mapped',
          'Not mapped',
          'Partial',
          expect.stringContaining('Complete missing provider mappings'),
        ],
      ]),
    );

    expect(providerCostDetailRows(comparison)).toEqual(
      expect.arrayContaining([
        [
          'Provider total',
          'aws',
          'all',
          'all',
          'aws monthly total',
          '',
          '',
          '71',
          '100%',
          'Review required',
          '3 line item(s) roll up to $71/mo.',
        ],
        [
          'Category subtotal',
          'aws',
          'network',
          'egress',
          'network / egress subtotal',
          '',
          '',
          '46.08',
          '64.9%',
          'Mapped',
          'aws subtotal across 1 row(s).',
        ],
        expect.arrayContaining([
          'Line item',
          'aws',
          'network',
          'egress',
          'internet egress',
          '',
          'us-east-1',
          '46.08',
          '64.9%',
          'Mapped',
          expect.stringContaining('$0.09 per GB rolled into $46.08 monthly'),
        ]),
      ]),
    );

    expect(costCoverageMapRows(comparison)).toEqual(
      expect.arrayContaining([
        [
          'aws',
          'Compute families and sizing',
          'Covered',
          '1',
          '0',
          '60.8',
          expect.stringContaining('risky compute'),
          expect.stringContaining('Validate family'),
        ],
        [
          'aws',
          'Database, NoSQL, cache, warehouse, and search',
          'Partial',
          '1',
          '1',
          '10.2',
          expect.stringContaining('primary "postgres"'),
          expect.stringContaining('Validate engine tier'),
        ],
        [
          'gcp',
          'Compute families and sizing',
          'Missing priced row',
          '0',
          '0',
          '',
          expect.stringContaining('configured requirement but no priced row'),
          expect.stringContaining('Validate family'),
        ],
      ]),
    );

    expect(methodologySourceRows(comparison)).toEqual(
      expect.arrayContaining([
        [
          'Provider catalog APIs',
          expect.stringContaining('AWS Price List bulk offer files'),
          expect.stringContaining('SKU Mapping Appendix'),
        ],
        [
          'Modeled fallback rows',
          expect.stringContaining('0 line item(s) use PolyCost modeled SKU IDs'),
          expect.stringContaining('provider calculator evidence'),
        ],
      ]),
    );

    expect(skuMappingAppendixRows(comparison)).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          'aws',
          'compute',
          'compute',
          expect.stringContaining('compute/vm-compute'),
          'No SKU supplied',
          '=cmd(1)\\risky compute',
          'us-east',
          '',
          '',
          '',
          '60.8',
          'Mapped',
          'flat',
          expect.stringContaining('Provider adapter monthly subtotal'),
        ]),
      ]),
    );

    expect(workloadScopeRows(comparison)).toEqual(
      expect.arrayContaining([
        ['Workload name', 'Client portal'],
        ['Environment', 'production'],
        ['Data residency', 'eu (locked)'],
        ['Usage pattern', 'bursty (25% average utilization)'],
        ['Cost allocation tags', 'team:platform, project:migration-q3'],
        ['Normalized service requirements', '1'],
      ]),
    );
  });

  it('builds selected scenario rows for unavailable commitments and spot estimates', () => {
    const rows = selectedScenarioRows(
      {
        ...comparison,
        providers: [
          {
            ...comparison.providers[0],
            pricingModels: [
              {
                model: 'spot',
                available: true,
                monthlyCostUsd: 35,
                hourlyCostUsd: 0.05,
                caveat: 'Interruptible capacity.',
              },
            ],
          },
          comparison.providers[1],
        ],
      },
      { interval: 'yearly', pricingModel: 'spot' },
    );

    expect(rows[0]).toEqual([
      'Provider',
      'Available',
      'Yearly USD',
      'Monthly USD',
      'Hourly USD',
      'Caveat',
    ]);
    expect(rows[1]).toEqual(['aws', 'yes', '420', '35', '0.05', 'Interruptible capacity.']);
    expect(rows[2]).toEqual([
      'gcp',
      'no',
      '',
      '',
      '',
      'Not available for this SKU/region.',
    ]);
  });

  it('labels every report interval and pricing model', () => {
    const intervals = ['hourly', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const;
    const pricingModels = [
      'on-demand',
      'reserved-1yr',
      'reserved-3yr',
      'savings-plan',
      'spot',
    ] as const;

    expect(intervals.map((interval) => labelForInterval(interval))).toEqual([
      'Hourly',
      'Daily',
      'Weekly',
      'Monthly',
      'Quarterly',
      'Yearly',
    ]);
    expect(pricingModels.map((pricingModel) => labelForPricingModel(pricingModel))).toEqual([
      'On-demand',
      'Reserved 1-year',
      'Reserved 3-year',
      'Savings Plan / CUD',
      'Spot estimate range',
    ]);
  });

  it('builds evidence rows for line item pricing model availability', () => {
    const rows = lineItemEvidenceRows({
      ...comparison,
      providers: [
        {
          ...comparison.providers[0],
          lineItems: [
            {
              category: 'compute',
              description: 'priced compute',
              isApproximate: false,
              baseHourlyCostUsd: 0.1,
              baseMonthlyCostUsd: 73,
              region: 'us-east-1',
              unit: 'hour',
              unitPriceUsd: 0.1,
              pricingModels: [
                {
                  model: 'reserved-1yr',
                  available: true,
                  monthlyCostUsd: 50,
                },
                {
                  model: 'reserved-3yr',
                  available: false,
                  unavailableReason: 'No term for SKU.',
                },
              ],
            },
          ],
        },
      ],
    });

    expect(rows[1][8]).toBe('$0.1 hourly x 730 hours = $73 monthly');
    expect(rows[1][9]).toContain('reserved-1yr: $50 monthly');
    expect(rows[1][9]).toContain('reserved-3yr: unavailable (No term for SKU.)');
  });

  it('builds payment TCO and egress tier audit rows', () => {
    const tcoRows = commitmentTcoRows(comparison);
    const egressRows = egressTierBreakdownRows(comparison);

    expect(tcoRows[0]).toContain('Term TCO USD');
    expect(tcoRows).toContainEqual(
      expect.arrayContaining([
        'aws',
        'Reserved 3-year',
        'yes',
        '0.06',
        '42',
        '360',
        'All upfront',
        '36 months',
        '1872',
      ]),
    );
    expect(egressRows[0]).toContain('Effective blended USD/GB');
    expect(egressRows).toContainEqual(
      expect.arrayContaining(['aws', 'us-east-1', '0-512 GB', '512', '0.09', '46.08']),
    );
  });

  it('builds production-grade optimization, network, region, and break-even rows', () => {
    expect(optimizationOpportunityRows(comparison)).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          'Commitment coverage',
          'aws Reserved 3-year lowers recurring run rate; 35% remains exposed at the target coverage setting.',
          '10.15',
          '121.8',
        ]),
        expect.arrayContaining([
          'Right-sizing',
          'aws compute averages 25% utilization; evaluate smaller instance sizes, autoscaling bounds, or scheduled capacity before committing.',
          '21.28',
          '255.36',
        ]),
        expect.arrayContaining([
          'Compute specification',
          'aws M7i/M6i mapping should be validated for vCPU/RAM, network bandwidth, and disk baseline; evaluate M7g Graviton3 as an ARM target before locking M7i/M6i.',
          '12.16',
          '145.92',
        ]),
        expect.arrayContaining([
          'Architecture risk',
          'aws data-transfer line items are 64.9% of monthly spend; validate CDN, NAT, cross-AZ, and inter-region paths before sign-off.',
          '',
          '',
          'High',
          'Medium',
        ]),
        expect.arrayContaining([
          'Egress optimization',
          'aws egress is 64.9% of monthly spend; evaluate CDN offload, cache-control, and same-region data access.',
          '13.82',
          '165.84',
          'High',
          'Medium',
          'aws egress/network baseline is $46.08/mo; rule-based reduction is 30% when no single network driver dominates.',
        ]),
      ]),
    );
    expect(egressNetworkingDetailRows(comparison)).toEqual(
      expect.arrayContaining([
        expect.arrayContaining(['aws', 'egress', 'internet egress', 'us-east-1', '46.08']),
      ]),
    );
    expect(regionComparisonRows(comparison)).toEqual(
      expect.arrayContaining([
        expect.arrayContaining(['aws', 'eu-west', 'eu-west-1', '76.68', '5.68', '1.08']),
      ]),
    );
    expect(breakEvenSummaryRows(comparison)).toEqual(
      expect.arrayContaining([
        expect.arrayContaining(['aws', 'Reserved 3-year', '71', '42', '360', '29', '13']),
      ]),
    );

    expect(
      optimizationOpportunityRows({
        ...comparison,
        providers: [
          {
            ...comparison.providers[0],
            lineItems: [
              ...comparison.providers[0].lineItems,
              {
                category: 'licensing',
                costComponent: 'licensing',
                description: 'AWS Windows OS licensing estimate',
                isApproximate: true,
                baseMonthlyCostUsd: 24,
              },
            ],
            totals: {
              ...comparison.providers[0].totals,
              monthly: 95,
            },
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          'License optimization',
          'aws includes Windows/licensing cost; validate Linux equivalent or BYOL eligibility before committing.',
          '24',
          '288',
          'Medium',
          'Medium',
          'Windows run-rate $95/mo vs Linux/BYOL-equivalent $71/mo; explicit licensing uplift is $24/mo.',
        ]),
      ]),
    );

    expect(
      optimizationOpportunityRows({
        ...comparison,
        requirements: {
          ...comparison.requirements!,
          serviceRequirements: [
            ...comparison.requirements!.serviceRequirements,
            {
              serviceCategory: 'storage',
              serviceType: 'object-storage',
              instanceType: 'object / archive - 1000 GB',
              tier: 'archive',
              region: 'us-east',
              quantity: 1,
              scaleParams: {
                role: 'uploads',
                sizeGb: 1000,
                storageClass: 'archive',
                monthlyRetrievalGb: 250,
                snapshotSizeGb: 500,
                snapshotRetentionDays: 60,
                replication: 'none',
              },
            },
          ],
        },
        providers: [
          {
            providerId: 'aws',
            lineItems: [
              {
                category: 'network',
                costComponent: 'egress',
                description:
                  'AWS VPN connectivity estimate (2 connection(s), 730 hrs, 1000 GB transfer)',
                skuId: 'modeled-vpn-connectivity',
                isApproximate: true,
                baseMonthlyCostUsd: 163,
              },
              {
                category: 'network',
                costComponent: 'egress',
                description:
                  'AWS private circuit estimate (1 circuit(s), 730 port hrs, 2000 GB transfer)',
                skuId: 'modeled-private-circuit',
                isApproximate: true,
                baseMonthlyCostUsd: 259,
              },
            ],
            totals: {
              daily: 15.4,
              weekly: 107.8,
              monthly: 462,
              quarterly: 1386,
              yearly: 5544,
            },
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          'Egress optimization',
          'aws egress is 91.34% of monthly spend; validate port speed, redundancy, metered-vs-unlimited transfer, and VPN-to-private-circuit break-even before final network design.',
          '64.75',
          '777',
          'High',
          'High',
          'aws largest network row is "AWS private circuit estimate (1 circuit(s), 730 port hrs, 2000 GB transfer)" at $259/mo; private-connectivity architecture review is modeled as a 25% reduction of that baseline.',
        ]),
      ]),
    );

    expect(
      optimizationOpportunityRows({
        ...comparison,
        providers: [
          {
            ...comparison.providers[0],
            pricingModels: [
              ...(comparison.providers[0].pricingModels ?? []),
              {
                model: 'spot',
                available: true,
                monthlyCostUsd: 35,
                hourlyCostUsd: 0.05,
                estimated: true,
                volatility: 'volatile',
                caveat: 'Interruptible capacity.',
              },
            ],
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          'Spot blend',
          'aws can model a 60% on-demand / 40% spot blend for interruptible capacity.',
          '14.4',
          '172.8',
          'Medium',
          'High',
          expect.stringContaining('blended estimate is $56.6/mo'),
        ]),
      ]),
    );

    expect(
      optimizationOpportunityRows({
        ...comparison,
        requirements: {
          ...comparison.requirements!,
          serviceRequirements: [
            ...comparison.requirements!.serviceRequirements,
            {
              serviceCategory: 'database',
              serviceType: 'nosql-database',
              instanceType: 'generic_nosql / 250GB',
              tier: 'managed',
              region: 'us-east',
              quantity: 1,
              scaleParams: {
                databaseEngine: 'generic_nosql',
                databaseSizeGb: 250,
                ruPerSecond: 4000,
                nosqlReadRequestUnitsMillion: 50,
                nosqlWriteRequestUnitsMillion: 20,
                backupStorageGb: 100,
                backupRetentionDays: 30,
                provisionedIops: 8000,
                readReplicaCount: 1,
                crossRegionReplicaTransferGb: 100,
              },
            },
          ],
        },
        providers: [
          {
            providerId: 'aws',
            lineItems: [
              {
                category: 'storage',
                costComponent: 'storage',
                description: 'AWS snapshot retention estimate',
                skuId: 'modeled-storage-snapshots',
                isApproximate: false,
                baseMonthlyCostUsd: 40,
              },
              {
                category: 'storage',
                costComponent: 'storage',
                description: 'AWS archive retrieval estimate',
                skuId: 'modeled-storage-retrieval',
                isApproximate: false,
                baseMonthlyCostUsd: 15,
              },
            ],
            totals: {
              daily: 3.95,
              weekly: 27.69,
              monthly: 120,
              quarterly: 360,
              yearly: 1440,
            },
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          'Storage optimization',
          'aws storage is 45.83% of monthly spend; tune snapshot retention and deduplicate backup copies before approving the storage run-rate.',
          '12',
          '144',
          'Low',
          'Low',
          'aws dominant storage row is "AWS snapshot retention estimate" at $40/mo; retention pruning is modeled as a 30% reduction of that row.',
        ]),
        expect.arrayContaining([
          'Storage anatomy',
          'aws storage class/type review: archive; validate snapshot retention and older-copy tiering before final quote.',
          '',
          '',
          'Medium',
          'Low',
          expect.stringContaining('retrieval $15/mo, snapshot $40/mo'),
        ]),
      ]),
    );

    expect(
      optimizationOpportunityRows({
        ...comparison,
        providers: [
          {
            providerId: 'aws',
            lineItems: [
              {
                category: 'database',
                costComponent: 'database',
                description: 'AWS primary RU/s provisioned capacity estimate',
                skuId: 'modeled-database-ru-capacity',
                isApproximate: false,
                baseMonthlyCostUsd: 80,
              },
              {
                category: 'database',
                costComponent: 'database',
                description: 'AWS primary NoSQL write unit estimate',
                skuId: 'modeled-database-nosql-write-units',
                isApproximate: false,
                baseMonthlyCostUsd: 40,
              },
            ],
            totals: {
              daily: 6.58,
              weekly: 46.15,
              monthly: 200,
              quarterly: 600,
              yearly: 2400,
            },
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          'Database optimization',
          'aws database and analytics data services are 60% of monthly spend; validate RU/s utilization, autoscale limits, and serverless/provisioned break-even before production traffic.',
          '20',
          '240',
          'Low',
          'Medium',
          'aws dominant database row is "AWS primary RU/s provisioned capacity estimate" at $80/mo; RU/s right-sizing is modeled as a 25% reduction of that row.',
        ]),
        expect.arrayContaining([
          'Database anatomy',
          'aws generic_nosql capacity review; validate RU/s utilization, autoscale bounds, and serverless break-even.',
          '',
          '',
          'High',
          'Medium',
          expect.stringContaining('ru $80/mo, nosql $40/mo'),
        ]),
      ]),
    );

    expect(
      optimizationOpportunityRows({
        ...comparison,
        providers: [
          {
            providerId: 'aws',
            lineItems: [
              {
                category: 'database',
                costComponent: 'database',
                description: 'Amazon OpenSearch Service capacity estimate',
                skuId: 'modeled-database-search-capacity',
                isApproximate: false,
                baseMonthlyCostUsd: 120,
              },
            ],
            totals: {
              daily: 6.58,
              weekly: 46.15,
              monthly: 200,
              quarterly: 600,
              yearly: 2400,
            },
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          'Database optimization',
          'aws database and analytics data services are 60% of monthly spend; right-size search replicas, partitions, index lifecycle, and query capacity before scaling managed-search clusters.',
          '26.4',
          '316.8',
          'Medium',
          'Medium',
          'aws dominant database row is "Amazon OpenSearch Service capacity estimate" at $120/mo; managed-search tuning is modeled as a 22% reduction of that row.',
        ]),
      ]),
    );

    expect(
      optimizationOpportunityRows({
        ...comparison,
        providers: [
          {
            providerId: 'aws',
            lineItems: [
              {
                category: 'compute',
                costComponent: 'compute',
                description: 'AWS serverless function GB-second estimate',
                skuId: 'modeled-serverless-function-duration',
                isApproximate: false,
                baseMonthlyCostUsd: 90,
              },
              {
                category: 'operations',
                costComponent: 'operations',
                description: 'AWS managed Kubernetes control plane estimate',
                skuId: 'modeled-kubernetes-control-plane',
                isApproximate: false,
                baseMonthlyCostUsd: 72,
              },
            ],
            totals: {
              daily: 7.89,
              weekly: 55.38,
              monthly: 240,
              quarterly: 720,
              yearly: 2880,
            },
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          'Runtime optimization',
          'aws serverless/container runtime is 67.5% of monthly spend; tune function memory-duration settings and compare functions with always-on containers for steady traffic.',
          '22.5',
          '270',
          'Medium',
          'Medium',
          'aws dominant runtime row is "AWS serverless function GB-second estimate" at $90/mo; function runtime tuning is modeled as a 25% reduction of that row.',
        ]),
      ]),
    );

    expect(
      optimizationOpportunityRows({
        ...comparison,
        requirements: {
          ...comparison.requirements!,
          serviceRequirements: [
            {
              serviceCategory: 'compute',
              serviceType: 'serverless-functions',
              quantity: 1,
              scaleParams: {
                functionInvocationsMillion: 5,
                functionDurationMs: 200,
                functionMemoryMb: 512,
              },
            },
          ],
        },
        providers: [
          {
            providerId: 'aws',
            lineItems: [],
            totals: {
              daily: 0.31,
              weekly: 2.15,
              monthly: 9.33,
              quarterly: 27.99,
              yearly: 111.96,
            },
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          'Serverless memory curve',
          'aws function memory break-even: 1024MB must run at or below 100ms to keep GB-second cost flat while improving latency.',
          '0',
          '0',
          'Low',
          'Low',
          'aws current function shape is 5M invocations/month at 200ms and 512MB: $9.33/mo current vs $9.33/mo at the linear memory-duration knee.',
        ]),
      ]),
    );

    expect(
      optimizationOpportunityRows({
        ...comparison,
        requirements: {
          ...comparison.requirements!,
          serviceRequirements: [
            {
              serviceCategory: 'application',
              serviceType: 'app-platform',
              quantity: 1,
              scaleParams: {
                appPlatformRequestsMillion: 10,
                appPlatformRequestDurationMs: 400,
                appPlatformVcpu: 1,
                appPlatformMemoryGb: 0.5,
                appPlatformAlwaysOnHours: 730,
                appPlatformMinInstances: 1,
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
                costComponent: 'compute',
                description: 'AWS managed app platform request estimate',
                skuId: 'modeled-app-platform-requests',
                isApproximate: true,
                baseMonthlyCostUsd: 0,
              },
              {
                category: 'compute',
                costComponent: 'compute',
                description: 'AWS managed app platform active vCPU estimate',
                skuId: 'modeled-app-platform-request-compute',
                isApproximate: true,
                baseMonthlyCostUsd: 71.11,
              },
              {
                category: 'compute',
                costComponent: 'compute',
                description: 'AWS managed app platform active memory estimate',
                skuId: 'modeled-app-platform-request-memory',
                isApproximate: true,
                baseMonthlyCostUsd: 3.89,
              },
            ],
            totals: {
              daily: 3.29,
              weekly: 23.08,
              monthly: 100,
              quarterly: 300,
              yearly: 1200,
            },
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          'App platform model',
          'aws always-on app-hosting posture is favored for the configured traffic; validate request-based only if idle windows or traffic spikes dominate.',
          '25.72',
          '308.64',
          'Medium',
          'Low',
          'aws request-based model $75/mo vs always-on $49.28/mo for 10M requests, 400ms, 1 vCPU, 0.5GB, 1 minimum instance(s), 730 hrs/mo.',
        ]),
      ]),
    );

    expect(
      optimizationOpportunityRows({
        ...comparison,
        providers: [
          {
            providerId: 'aws',
            lineItems: [
              {
                category: 'operations',
                costComponent: 'operations',
                description: 'AWS log ingestion estimate',
                skuId: 'modeled-operations-log-ingestion',
                isApproximate: false,
                baseMonthlyCostUsd: 120,
              },
              {
                category: 'operations',
                costComponent: 'operations',
                description: 'AWS managed secrets estimate',
                skuId: 'modeled-security-secrets',
                isApproximate: false,
                baseMonthlyCostUsd: 20,
              },
            ],
            totals: {
              daily: 6.58,
              weekly: 46.15,
              monthly: 200,
              quarterly: 600,
              yearly: 2400,
            },
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          'Operations optimization',
          'aws observability/security operations are 70% of monthly spend; filter debug noise at source, sample high-volume streams, and route low-value logs to cheaper retention.',
          '36',
          '432',
          'Medium',
          'Low',
          'aws dominant operations row is "AWS log ingestion estimate" at $120/mo; log filtering is modeled as a 30% reduction of that row.',
        ]),
      ]),
    );
  });

  it('builds fallback service requirement rows when comparison requirements are absent', () => {
    expect(
      serviceRequirementRows({
        ...comparison,
        requirements: undefined,
      }),
    ).toEqual([['No normalized service requirements were attached to this comparison.']]);
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
