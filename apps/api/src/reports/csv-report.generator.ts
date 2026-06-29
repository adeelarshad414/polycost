import { Injectable } from '@nestjs/common';
import { ComparisonResult } from '../comparison/comparison.types';
import { buildReportInsights } from './report-insights';
import { sanitizeSpreadsheetText } from './report-security';

@Injectable()
export class CsvReportGenerator {
  generate(result: ComparisonResult): Buffer {
    const rows: string[][] = [
      ['PolyCost Comparison Report'],
      ['Comparison ID', result.comparisonId],
      ['Pricing As Of', result.pricingAsOf],
      ['Cheapest Provider', result.cheapestProviderId],
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
