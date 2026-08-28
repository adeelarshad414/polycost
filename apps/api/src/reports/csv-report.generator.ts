import { Injectable } from '@nestjs/common';
import { ComparisonResult } from '../comparison/comparison.types';
import {
  architectureOverviewRows,
  breakEvenSummaryRows,
  commitmentTcoRows,
  costCoverageMapRows,
  dataFreshnessRows,
  decisionSummaryRows,
  egressNetworkingDetailRows,
  egressTierBreakdownRows,
  lineItemEvidenceRows,
  methodologySourceRows,
  optimizationOpportunityRows,
  pricingModelAvailabilityRows,
  providerCostDetailRows,
  providerRankingRows,
  regionComparisonRows,
  reportAssumptionRows,
  reportContextRows,
  reportCoverRows,
  selectedScenarioRows,
  serviceRequirementRows,
  sourceDiagramRows,
  skuMappingAppendixRows,
  workloadScopeRows,
} from './report-evidence';
import { buildReportInsights } from './report-insights';
import { sanitizeSpreadsheetText } from './report-security';
import { ReportOptions } from './report.types';

const UTF8_BOM = '\ufeff';
const CSV_LINE_BREAK = '\r\n';

@Injectable()
export class CsvReportGenerator {
  generate(result: ComparisonResult, options: ReportOptions = {}): Buffer {
    const rows: string[][] = [
      ['PolyCost Comparison Report'],
      ...reportCoverRows(result, options).map((row) => row.map(sanitizeSpreadsheetText)),
      ['Cheapest provider (on-demand baseline)', result.cheapestProviderId],
      ...reportContextRows(options),
      [],
      ['Data Freshness'],
      ...dataFreshnessRows(options).map((row) => row.map(sanitizeSpreadsheetText)),
      [],
      ['Decision Summary'],
      ...decisionSummaryRows(result, options).map((row) => row.map(sanitizeSpreadsheetText)),
      [],
      ['Provider Ranking'],
      ...providerRankingRows(result, options).map((row) => row.map(sanitizeSpreadsheetText)),
      [],
      ['Workload Scope'],
      ...workloadScopeRows(result).map((row) => row.map(sanitizeSpreadsheetText)),
      [],
      ['Architecture Overview'],
      ...architectureOverviewRows(result).map((row) => row.map(sanitizeSpreadsheetText)),
      ...sourceDiagramCsvRows(result),
      [],
      ['FinOps Summary'],
      ['Metric', 'Value'],
      ...buildReportInsights(result).map((insight) => [
        insight.label,
        sanitizeSpreadsheetText(insight.value),
      ]),
      [],
      ['Provider Totals'],
      ['Provider', 'Daily USD', 'Weekly USD', 'Monthly USD', 'Quarterly USD', 'Yearly USD'],
      ...result.providers.map((provider) => [
        provider.providerId,
        provider.totals.daily.toString(),
        provider.totals.weekly.toString(),
        provider.totals.monthly.toString(),
        provider.totals.quarterly.toString(),
        provider.totals.yearly.toString(),
      ]),
      [],
      ['Provider Cost Detail'],
      ...providerCostDetailRows(result).map((row) => row.map(sanitizeSpreadsheetText)),
      [],
      ['Cost Coverage Map'],
      ...costCoverageMapRows(result).map((row) => row.map(sanitizeSpreadsheetText)),
      [],
      ['Selected Pricing Scenario'],
      ...selectedScenarioRows(result, options).map((row) => row.map(sanitizeSpreadsheetText)),
      [],
      ['Pricing Model Availability'],
      ...pricingModelAvailabilityRows(result).map((row) => row.map(sanitizeSpreadsheetText)),
      [],
      ['Commitment Payment and TCO'],
      ...commitmentTcoRows(result).map((row) => row.map(sanitizeSpreadsheetText)),
      [],
      ['Egress Tiered Breakdown'],
      ...egressTierBreakdownRows(result).map((row) => row.map(sanitizeSpreadsheetText)),
      [],
      ['Egress & Networking Detail'],
      ...egressNetworkingDetailRows(result).map((row) => row.map(sanitizeSpreadsheetText)),
      [],
      ['Optimization Opportunities'],
      ...optimizationOpportunityRows(result).map((row) => row.map(sanitizeSpreadsheetText)),
      [],
      ['Region Comparison'],
      ...regionComparisonRows(result).map((row) => row.map(sanitizeSpreadsheetText)),
      [],
      ['Break-Even Analysis'],
      ...breakEvenSummaryRows(result).map((row) => row.map(sanitizeSpreadsheetText)),
      [],
      ['Normalized Service Requirements'],
      ...serviceRequirementRows(result).map((row) => row.map(sanitizeSpreadsheetText)),
      [],
      ['Line Items'],
      ['Provider', 'Category', 'Description', 'Approximate', 'Monthly USD'],
      ...result.providers.flatMap((provider) =>
        provider.lineItems.map((lineItem) => [
          provider.providerId,
          lineItem.category,
          sanitizeSpreadsheetText(lineItem.description),
          lineItem.isApproximate ? 'yes' : 'no',
          lineItem.baseMonthlyCostUsd.toString(),
        ]),
      ),
      [],
      ['Rate Math Evidence'],
      ...lineItemEvidenceRows(result).map((row) => row.map(sanitizeSpreadsheetText)),
      [],
      ['Methodology & Data Sources'],
      ...methodologySourceRows(result).map((row) => row.map(sanitizeSpreadsheetText)),
      [],
      ['SKU Mapping Appendix'],
      ...skuMappingAppendixRows(result).map((row) => row.map(sanitizeSpreadsheetText)),
      [],
      ['Report Assumptions'],
      ...reportAssumptionRows(result).map((row) => row.map(sanitizeSpreadsheetText)),
    ];

    if (result.warnings && result.warnings.length > 0) {
      rows.push(
        [],
        ['Warnings'],
        ['Provider', 'Code', 'Message'],
        ...result.warnings.map((warning) => [
          warning.providerId ?? '',
          warning.code,
          sanitizeSpreadsheetText(warning.message),
        ]),
      );
    }

    // RFC 4180 line endings, and a UTF-8 BOM so Excel detects the encoding when
    // the file is opened directly. Without the BOM Excel assumes the legacy
    // system codepage and mangles any non-ASCII text (currency symbols,
    // accented provider or region names).
    const body = rows.map((row) => row.map(csvCell).join(',')).join(CSV_LINE_BREAK);

    return Buffer.from(`${UTF8_BOM}${body}${CSV_LINE_BREAK}`, 'utf8');
  }
}

function sourceDiagramCsvRows(result: ComparisonResult): string[][] {
  const rows = sourceDiagramRows(result);

  if (rows.length === 0) {
    return [];
  }

  return [[], ['Source Diagram'], ...rows.map((row) => row.map(sanitizeSpreadsheetText))];
}

function csvCell(value: string): string {
  if (!/[",\r\n]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}
