import { Injectable } from '@nestjs/common';
import { ComparisonLineItem, ComparisonResult } from '../comparison/comparison.types';
import {
  breakEvenSummaryRows,
  commitmentTcoRows,
  decisionSummaryRows,
  egressNetworkingDetailRows,
  egressTierBreakdownRows,
  lineItemEvidenceRows,
  methodologySourceRows,
  optimizationOpportunityRows,
  pricingModelAvailabilityRows,
  providerRankingRows,
  regionComparisonRows,
  reportAssumptionRows,
  reportContextRows,
  selectedScenarioRows,
  serviceRequirementRows,
  skuMappingAppendixRows,
  workloadScopeRows,
} from './report-evidence';
import { buildReportInsights } from './report-insights';
import { escapePdfText } from './report-security';
import { ReportOptions } from './report.types';

interface PdfLine {
  text: string;
  fontSize: number;
}

interface RgbColor {
  red: number;
  green: number;
  blue: number;
}

interface ServiceMixSlice {
  label: string;
  value: number;
  color: RgbColor;
}

const LINES_PER_PAGE = 42;
const CHART_ORIGIN_X = 58;
const PROVIDER_BAR_MAX_WIDTH = 330;
const STACKED_BAR_WIDTH = 360;
const TEXT_COLOR: RgbColor = { red: 0.07, green: 0.08, blue: 0.12 };
const MUTED_TEXT_COLOR: RgbColor = { red: 0.36, green: 0.39, blue: 0.45 };

@Injectable()
export class PdfReportGenerator {
  generate(result: ComparisonResult, options: ReportOptions = {}): Buffer {
    const lines = this.lines(result, options);
    const pageContents = [
      ...chunk(lines, LINES_PER_PAGE).map((page) => pageContent(page)),
      ...visualDeckPageContents(result, options),
    ];
    const objects: string[] = [];
    const pageObjectNumbers: number[] = [];

    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    objects.push('');
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

    for (const content of pageContents) {
      const pageObjectNumber = objects.length + 1;
      const contentObjectNumber = objects.length + 2;
      pageObjectNumbers.push(pageObjectNumber);
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`,
      );
      objects.push(`<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream`);
    }

    objects[1] = `<< /Type /Pages /Kids [${pageObjectNumbers
      .map((objectNumber) => `${objectNumber} 0 R`)
      .join(' ')}] /Count ${pageObjectNumbers.length} >>`;

    return buildPdf(objects);
  }

  private lines(result: ComparisonResult, options: ReportOptions): PdfLine[] {
    const lines: PdfLine[] = [
      { text: 'PolyCost Comparison Report', fontSize: 18 },
      { text: `Comparison ID: ${result.comparisonId}`, fontSize: 10 },
      { text: `Pricing as of: ${result.pricingAsOf}`, fontSize: 10 },
      {
        text: `Cheapest provider (on-demand baseline): ${result.cheapestProviderId}`,
        fontSize: 10,
      },
      ...reportContextRows(options).map((row) => ({
        text: `${row[0]}: ${row[1]}`,
        fontSize: 10,
      })),
      { text: '', fontSize: 10 },
      { text: 'Decision summary', fontSize: 14 },
      ...decisionSummaryRows(result, options)
        .slice(1)
        .map((row) => ({
          text: `${row[0]}: ${row[1]}`,
          fontSize: 10,
        })),
      { text: '', fontSize: 10 },
      { text: 'Provider ranking', fontSize: 14 },
      ...providerRankingRows(result, options)
        .slice(1)
        .map((row) => ({
          text: providerRankingPdfText(row),
          fontSize: 10,
        })),
      { text: '', fontSize: 10 },
      { text: 'Workload scope', fontSize: 14 },
      ...workloadScopeRows(result)
        .slice(1)
        .map((row) => ({
          text: `${row[0]}: ${row[1]}`,
          fontSize: 10,
        })),
      { text: '', fontSize: 10 },
      { text: 'FinOps summary', fontSize: 14 },
      ...buildReportInsights(result).map((insight) => ({
        text: `${insight.label}: ${insight.value}`,
        fontSize: 10,
      })),
      { text: '', fontSize: 10 },
      { text: 'Provider totals', fontSize: 14 },
    ];

    for (const provider of result.providers) {
      lines.push({
        text: `${provider.providerId}: daily $${provider.totals.daily}, weekly $${provider.totals.weekly}, monthly $${provider.totals.monthly}, quarterly $${provider.totals.quarterly}, yearly $${provider.totals.yearly}`,
        fontSize: 10,
      });
    }

    lines.push({ text: '', fontSize: 10 }, { text: 'Selected pricing scenario', fontSize: 14 });
    for (const row of selectedScenarioRows(result, options).slice(1)) {
      lines.push({
        text: selectedScenarioPdfText(row),
        fontSize: 10,
      });
    }

    lines.push(
      { text: '', fontSize: 10 },
      { text: 'Pricing model availability', fontSize: 14 },
    );
    for (const row of pricingModelAvailabilityRows(result).slice(1)) {
      lines.push({
        text: `${row[0]} | on-demand ${row[1]} | reserved 1yr ${row[2]} | reserved 3yr ${row[3]} | savings ${row[4]} | spot ${row[5]}`,
        fontSize: 10,
      });
      lines.push({
        text: `Evidence note: ${row[6]}`,
        fontSize: 10,
      });
    }

    lines.push(
      { text: '', fontSize: 10 },
      { text: 'Commitment payment and TCO', fontSize: 14 },
    );
    for (const row of commitmentTcoRows(result).slice(1)) {
      lines.push({
        text: `${row[0]} | ${row[1]} | available ${row[2]} | monthly $${row[4]} | upfront $${row[5] || 'n/a'} | payment ${row[6]} | term ${row[7]} | TCO $${row[8] || 'n/a'} | savings ${row[9] || 'n/a'}`,
        fontSize: 10,
      });
    }

    lines.push({ text: '', fontSize: 10 }, { text: 'Egress tiered breakdown', fontSize: 14 });
    for (const row of egressTierBreakdownRows(result).slice(1)) {
      lines.push({
        text: `${row[0]} | ${row[1]} | ${row[2]} | billable ${row[3]} GB | rate $${row[4]}/GB | subtotal $${row[5]} | blended $${row[6] || 'n/a'}/GB`,
        fontSize: 10,
      });
    }

    lines.push(
      { text: '', fontSize: 10 },
      { text: 'Egress and networking detail', fontSize: 14 },
    );
    for (const row of egressNetworkingDetailRows(result).slice(1)) {
      lines.push({
        text: `${row[0]} | ${row[1]} | ${row[2]} | monthly $${row[4]} | share ${row[5]} | ${row[8]}`,
        fontSize: 10,
      });
    }

    lines.push(
      { text: '', fontSize: 10 },
      { text: 'Optimization opportunities', fontSize: 14 },
    );
    for (const row of optimizationOpportunityRows(result).slice(1)) {
      lines.push({
        text: `${row[0]} | ${row[1]} | monthly savings $${row[2] || 'n/a'} | priority ${row[4]} | effort ${row[5]}`,
        fontSize: 10,
      });
    }

    lines.push({ text: '', fontSize: 10 }, { text: 'Region comparison', fontSize: 14 });
    for (const row of regionComparisonRows(result).slice(1)) {
      lines.push({
        text: `${row[0]} | ${row[1]} (${row[2]}) | modeled monthly $${row[3]} | delta $${row[4]} | ${row[6]}`,
        fontSize: 10,
      });
    }

    lines.push({ text: '', fontSize: 10 }, { text: 'Break-even analysis', fontSize: 14 });
    for (const row of breakEvenSummaryRows(result).slice(1)) {
      lines.push({
        text: `${row[0]} | ${row[1]} | on-demand $${row[2]}/mo | committed $${row[3]}/mo | upfront $${row[4]} | break-even ${row[6]}`,
        fontSize: 10,
      });
    }

    lines.push(
      { text: '', fontSize: 10 },
      { text: 'Normalized service requirements', fontSize: 14 },
    );
    for (const row of serviceRequirementPdfRows(result)) {
      lines.push({
        text: serviceRequirementPdfText(row),
        fontSize: 10,
      });
    }

    lines.push({ text: '', fontSize: 10 }, { text: 'Line items', fontSize: 14 });

    for (const provider of result.providers) {
      for (const lineItem of provider.lineItems) {
        lines.push({
          text: `${provider.providerId} | ${lineItem.category} | ${lineItem.description} | ${
            lineItem.isApproximate ? 'approximate' : 'exact'
          } | $${lineItem.baseMonthlyCostUsd}`,
          fontSize: 10,
        });
      }
    }

    lines.push({ text: '', fontSize: 10 }, { text: 'Rate math evidence', fontSize: 14 });
    for (const row of lineItemEvidenceRows(result).slice(1)) {
      lines.push({
        text: `${row[0]} | ${row[1]} | ${row[2]} | ${row[8]}`,
        fontSize: 10,
      });
    }

    lines.push(
      { text: '', fontSize: 10 },
      { text: 'Methodology and data sources', fontSize: 14 },
    );
    for (const row of methodologySourceRows(result).slice(1)) {
      lines.push({
        text: `${row[0]}: ${row[1]} Reviewer action: ${row[2]}`,
        fontSize: 10,
      });
    }

    lines.push({ text: '', fontSize: 10 }, { text: 'SKU mapping appendix', fontSize: 14 });
    for (const row of skuMappingAppendixRows(result).slice(1)) {
      lines.push({
        text: `${row[0]} | ${row[1]} | ${row[4]} | ${row[5]} | confidence ${row[11]} | ${row[13]}`,
        fontSize: 10,
      });
    }

    lines.push({ text: '', fontSize: 10 }, { text: 'Report assumptions', fontSize: 14 });
    for (const row of reportAssumptionRows(result).slice(1)) {
      lines.push({
        text: `${row[0]}: ${row[1]}`,
        fontSize: 10,
      });
    }

    if (result.warnings && result.warnings.length > 0) {
      lines.push({ text: '', fontSize: 10 }, { text: 'Warnings', fontSize: 14 });

      for (const warning of result.warnings) {
        lines.push({
          text: `${warning.providerId ?? 'general'} | ${warning.code} | ${warning.message}`,
          fontSize: 10,
        });
      }
    }

    return lines.flatMap((line) => wrapLine(line));
  }
}

function visualDeckPageContents(result: ComparisonResult, options: ReportOptions): string[] {
  return [providerRunRateChartPage(result, options), serviceMixChartPage(result)];
}

function providerRunRateChartPage(result: ComparisonResult, options: ReportOptions): string {
  const commands = chartPageBase('PolyCost Visual Decision Deck', [
    'Provider monthly run-rate chart',
    `Scenario: ${options.pricingModel ?? 'on-demand'} at ${options.interval ?? 'monthly'} cadence`,
  ]);
  const maxMonthly = Math.max(...result.providers.map((provider) => provider.totals.monthly), 1);
  const cheapestMonthly = Math.min(...result.providers.map((provider) => provider.totals.monthly));

  commands.push(
    pdfText(
      CHART_ORIGIN_X,
      658,
      10,
      'Bars use cached comparison totals; this page is rendered server-side by the PDF exporter.',
      MUTED_TEXT_COLOR,
    ),
  );

  result.providers.forEach((provider, index) => {
    const y = 600 - index * 74;
    const width = Math.max(8, (provider.totals.monthly / maxMonthly) * PROVIDER_BAR_MAX_WIDTH);
    const color = providerColor(provider.providerId);
    const isLowest = provider.totals.monthly === cheapestMonthly;

    commands.push(
      pdfText(CHART_ORIGIN_X, y + 30, 12, provider.providerId.toUpperCase(), TEXT_COLOR),
      filledRect(CHART_ORIGIN_X + 92, y + 22, width, 22, color),
      pdfText(
        CHART_ORIGIN_X + 92 + width + 12,
        y + 27,
        10,
        `$${formatCurrency(provider.totals.monthly)} monthly`,
        TEXT_COLOR,
      ),
      pdfText(
        CHART_ORIGIN_X + 92,
        y + 4,
        9,
        `$${formatCurrency(provider.totals.yearly)} yearly${isLowest ? ' · lowest baseline' : ''}`,
        MUTED_TEXT_COLOR,
      ),
    );
  });

  commands.push(
    pdfText(
      CHART_ORIGIN_X,
      220,
      11,
      'Executive readout: validate regional SKU availability, resilience, and transfer paths before vendor commitment.',
      TEXT_COLOR,
    ),
  );

  return commands.join('\n');
}

function serviceMixChartPage(result: ComparisonResult): string {
  const commands = chartPageBase('Engineering Cost Evidence Deck', [
    'Service mix stacked chart',
    'Compute, storage, database, network, and other line-item totals by provider',
  ]);

  drawLegend(commands, [
    { label: 'Compute', color: categoryColor('compute') },
    { label: 'Storage', color: categoryColor('storage') },
    { label: 'Database', color: categoryColor('database') },
    { label: 'Network', color: categoryColor('network') },
    { label: 'Other', color: categoryColor('other') },
  ]);

  result.providers.forEach((provider, index) => {
    const y = 590 - index * 92;
    const slices = serviceMixSlices(provider.lineItems);
    const total = Math.max(
      slices.reduce((sum, slice) => sum + slice.value, 0),
      provider.totals.monthly,
      1,
    );
    let x = CHART_ORIGIN_X + 96;

    commands.push(
      pdfText(CHART_ORIGIN_X, y + 28, 12, provider.providerId.toUpperCase(), TEXT_COLOR),
      pdfText(
        CHART_ORIGIN_X + 96,
        y + 2,
        9,
        `Total monthly line items: $${formatCurrency(
          slices.reduce((sum, slice) => sum + slice.value, 0),
        )}`,
        MUTED_TEXT_COLOR,
      ),
    );

    for (const slice of slices) {
      const width = Math.max(4, (slice.value / total) * STACKED_BAR_WIDTH);
      commands.push(filledRect(x, y + 20, width, 24, slice.color));
      x += width;
    }
  });

  commands.push(
    pdfText(
      CHART_ORIGIN_X,
      210,
      10,
      'Line-item source: same evidence rows used by CSV and XLSX exports; approximate mappings remain labeled in the text section.',
      TEXT_COLOR,
    ),
  );

  return commands.join('\n');
}

function chartPageBase(title: string, subtitles: string[]): string[] {
  return [
    filledRect(0, 0, 612, 792, { red: 0.98, green: 0.98, blue: 0.97 }),
    filledRect(0, 734, 612, 58, { red: 0.95, green: 0.96, blue: 0.97 }),
    pdfText(CHART_ORIGIN_X, 754, 18, title, TEXT_COLOR),
    ...subtitles.map((subtitle, index) =>
      pdfText(CHART_ORIGIN_X, 716 - index * 18, 11, subtitle, MUTED_TEXT_COLOR),
    ),
  ];
}

function drawLegend(
  commands: string[],
  entries: Array<{ label: string; color: RgbColor }>,
): void {
  entries.forEach((entry, index) => {
    const x = CHART_ORIGIN_X + index * 94;

    commands.push(
      filledRect(x, 664, 12, 12, entry.color),
      pdfText(x + 18, 666, 9, entry.label, MUTED_TEXT_COLOR),
    );
  });
}

function serviceMixSlices(lineItems: ComparisonLineItem[]): ServiceMixSlice[] {
  const compute = totalForCategory(lineItems, 'compute');
  const storage = totalForCategory(lineItems, 'storage');
  const database = totalForCategory(lineItems, 'database');
  const network = totalForCategory(lineItems, 'network');
  const known = compute + storage + database + network;
  const all = lineItems.reduce((sum, lineItem) => sum + lineItem.baseMonthlyCostUsd, 0);
  const other = Math.max(0, all - known);

  return [
    { label: 'Compute', value: compute, color: categoryColor('compute') },
    { label: 'Storage', value: storage, color: categoryColor('storage') },
    { label: 'Database', value: database, color: categoryColor('database') },
    { label: 'Network', value: network, color: categoryColor('network') },
    { label: 'Other', value: other, color: categoryColor('other') },
  ].filter((slice) => slice.value > 0);
}

function totalForCategory(lineItems: ComparisonLineItem[], category: string): number {
  return lineItems
    .filter((lineItem) => lineItem.category === category)
    .reduce((sum, lineItem) => sum + lineItem.baseMonthlyCostUsd, 0);
}

function providerColor(providerId: ComparisonResult['providers'][number]['providerId']): RgbColor {
  switch (providerId) {
    case 'aws':
      return { red: 0.85, green: 0.35, blue: 0.19 };
    case 'azure':
      return { red: 0.22, green: 0.54, blue: 0.87 };
    case 'gcp':
      return { red: 0.11, green: 0.62, blue: 0.46 };
  }
}

function categoryColor(category: string): RgbColor {
  switch (category) {
    case 'compute':
      return { red: 0.85, green: 0.35, blue: 0.19 };
    case 'storage':
      return { red: 0.22, green: 0.54, blue: 0.87 };
    case 'database':
      return { red: 0.11, green: 0.62, blue: 0.46 };
    case 'network':
      return { red: 0.56, green: 0.39, blue: 0.86 };
    default:
      return { red: 0.5, green: 0.54, blue: 0.6 };
  }
}

function filledRect(x: number, y: number, width: number, height: number, color: RgbColor): string {
  return `${rgb(color)} rg\n${formatPdfNumber(x)} ${formatPdfNumber(y)} ${formatPdfNumber(
    width,
  )} ${formatPdfNumber(height)} re f`;
}

function pdfText(
  x: number,
  y: number,
  fontSize: number,
  text: string,
  color: RgbColor = TEXT_COLOR,
): string {
  return `${rgb(color)} rg\nBT\n/F1 ${fontSize} Tf\n1 0 0 1 ${formatPdfNumber(x)} ${formatPdfNumber(
    y,
  )} Tm\n(${escapePdfText(text)}) Tj\nET`;
}

function rgb(color: RgbColor): string {
  return `${formatPdfNumber(color.red)} ${formatPdfNumber(color.green)} ${formatPdfNumber(color.blue)}`;
}

function formatPdfNumber(value: number): string {
  return (Math.round((value + Number.EPSILON) * 1000) / 1000).toString();
}

function formatCurrency(value: number): string {
  return (Math.round((value + Number.EPSILON) * 100) / 100).toString();
}

function wrapLine(line: PdfLine): PdfLine[] {
  if (line.text.length <= 96) {
    return [line];
  }

  const words = line.text.split(' ');
  const lines: PdfLine[] = [];
  let current = '';

  for (const word of words) {
    if (word.length > 96) {
      if (current.length > 0) {
        lines.push({
          text: current,
          fontSize: line.fontSize,
        });
        current = '';
      }

      for (let index = 0; index < word.length; index += 96) {
        lines.push({
          text: word.slice(index, index + 96),
          fontSize: line.fontSize,
        });
      }

      continue;
    }

    const next = current.length === 0 ? word : `${current} ${word}`;

    if (next.length > 96) {
      lines.push({
        text: current,
        fontSize: line.fontSize,
      });
      current = word;
    } else {
      current = next;
    }
  }

  if (current.length > 0) {
    lines.push({
      text: current,
      fontSize: line.fontSize,
    });
  }

  return lines;
}

function serviceRequirementPdfRows(result: ComparisonResult): string[][] {
  const rows = serviceRequirementRows(result);

  return rows[0]?.length === 1 ? rows : rows.slice(1);
}

function serviceRequirementPdfText(row: string[]): string {
  if (row.length === 1) {
    return row[0];
  }

  return `${row[0]} | ${row[1]} | ${row[2]} | region ${row[3]} | ${row[4]} | qty ${row[5]}`;
}

function providerRankingPdfText(row: string[]): string {
  if (row[2] === 'no') {
    return `${row[0]} | ${row[1]} | not eligible for selected model | ${row[9]}`;
  }

  return `${row[0]} | ${row[1]} | eligible yes | selected $${row[3]} | monthly $${row[4]} | delta $${row[6]} | ${row[9]}`;
}

function selectedScenarioPdfText(row: string[]): string {
  if (row[1] === 'no') {
    return `${row[0]}: not eligible for selected model | ${row[5]}`;
  }

  return `${row[0]}: eligible yes | selected $${row[2]} | monthly $${row[3]} | ${row[5]}`;
}

function pageContent(lines: PdfLine[]): string {
  const commands = ['BT'];

  lines.forEach((line, index) => {
    const y = 750 - index * 16;
    commands.push(`/F1 ${line.fontSize} Tf`, `1 0 0 1 50 ${y} Tm`, `(${escapePdfText(line.text)}) Tj`);
  });

  commands.push('ET');

  return commands.join('\n');
}

function buildPdf(objects: string[]): Buffer {
  const chunks: string[] = ['%PDF-1.4\n'];
  const offsets = [0];
  let byteOffset = Buffer.byteLength(chunks[0], 'utf8');

  objects.forEach((objectBody, index) => {
    const objectNumber = index + 1;
    const objectText = `${objectNumber} 0 obj\n${objectBody}\nendobj\n`;

    offsets.push(byteOffset);
    chunks.push(objectText);
    byteOffset += Buffer.byteLength(objectText, 'utf8');
  });

  const xrefOffset = byteOffset;
  const xrefRows = offsets
    .map((offset, index) =>
      index === 0 ? '0000000000 65535 f ' : `${offset.toString().padStart(10, '0')} 00000 n `,
    )
    .join('\n');
  const trailer = `xref\n0 ${objects.length + 1}\n${xrefRows}\ntrailer\n<< /Size ${
    objects.length + 1
  } /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  chunks.push(trailer);

  return Buffer.from(chunks.join(''), 'utf8');
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}
