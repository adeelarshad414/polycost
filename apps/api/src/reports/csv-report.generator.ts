import { Injectable } from '@nestjs/common';
import { ComparisonResult } from '../comparison/comparison.types';
import {
  breakEvenSummaryRows,
  commitmentTcoRows,
  decisionSummaryRows,
  egressNetworkingDetailRows,
  egressTierBreakdownRows,
  lineItemEvidenceRows,
  optimizationOpportunityRows,
  pricingModelAvailabilityRows,
  providerRankingRows,
  regionComparisonRows,
  reportAssumptionRows,
  reportContextRows,
  selectedScenarioRows,
  serviceRequirementRows,
  workloadScopeRows,
} from './report-evidence';
import { buildReportInsights } from './report-insights';
import { sanitizeSpreadsheetText } from './report-security';
import { ReportOptions } from './report.types';

@Injectable()
export class CsvReportGenerator {
  generate(result: ComparisonResult, options: ReportOptions = {}): Buffer {
    const rows: string[][] = [
      ['PolyCost Comparison Report'],
      ['Comparison ID', result.comparisonId],
      ['Pricing As Of', result.pricingAsOf],
      ['Cheapest provider (on-demand baseline)', result.cheapestProviderId],
      ...reportContextRows(options),
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

    return Buffer.from(`${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`, 'utf8');
  }
}

function csvCell(value: string): string {
  if (!/[",\r\n]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}
