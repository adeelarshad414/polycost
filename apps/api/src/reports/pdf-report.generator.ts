import { Injectable } from '@nestjs/common';
import { ComparisonLineItem, ComparisonResult } from '../comparison/comparison.types.js';
import {
  REPORT_INK,
  categoryColor as brandCategoryColor,
  hexToRgb,
  providerBrand,
} from './report-brand.js';
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
  skuMappingAppendixRows,
  sourceDiagramRows,
  workloadScopeRows,
} from './report-evidence.js';
import { buildReportInsights } from './report-insights.js';
import { escapePdfText } from './report-security.js';
import { ReportOptions } from './report.types.js';

const HEADING_FONT_SIZE = 12;

interface PdfLine {
  text: string;
  fontSize: number;
  /** Render with the Helvetica-Bold face (F2) rather than regular (F1). */
  bold?: boolean;
  /**
   * When present the line is a table row: each cell is placed at its own x
   * offset instead of being concatenated into one string. Tabular sections used
   * to be emitted as pipe-joined prose that wrapped mid-record, which is what
   * made the export unreadable.
   */
  cells?: PdfCell[];
  /** Row background - the header band and zebra striping. */
  fill?: RgbColor;
  textColor?: RgbColor;
}

interface PdfCell {
  text: string;
  width: number;
  align?: 'left' | 'right';
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
const PAGE_MARGIN = 50;
const CONTENT_WIDTH = 512;
const COLUMN_GAP = 6;
const ROW_HEIGHT = 16;
const HEADER_BAND_COLOR: RgbColor = hexToRgb(REPORT_INK.heading);
const HEADER_TEXT_COLOR: RgbColor = { red: 1, green: 1, blue: 1 };
const ZEBRA_COLOR: RgbColor = hexToRgb(REPORT_INK.zebraFill);
const CHART_ORIGIN_X = 58;
const PROVIDER_BAR_MAX_WIDTH = 330;
const STACKED_BAR_WIDTH = 360;
/** Right edge of the paper (612) less the chart origin and a matching margin. */
const CHART_TEXT_WIDTH = 612 - CHART_ORIGIN_X - 50;
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
    // WinAnsiEncoding, so the octal escapes emitted by escapePdfText resolve to
    // the intended glyphs. Without it the reader falls back to
    // StandardEncoding, where a middle dot rendered as two stray marks.
    objects.push(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    );
    // F2: a real bold face. Without it, headings could only be distinguished by
    // size and colour, which reads as flat next to a typeset enterprise report.
    const boldFontObjectNumber = objects.length + 1;
    objects.push(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    );

    const totalPages = pageContents.length;

    for (const [pageIndex, rawContent] of pageContents.entries()) {
      const content = `${rawContent}\n${pageFooter(pageIndex + 1, totalPages)}`;
      const pageObjectNumber = objects.length + 1;
      const contentObjectNumber = objects.length + 2;
      pageObjectNumbers.push(pageObjectNumber);
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 ${boldFontObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`,
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
      ...reportCoverRows(result, options)
        .slice(1)
        .map((row) => ({
          text: `${row[0]}: ${row[1]}`,
          fontSize: 10,
        })),
      {
        text: `Cheapest provider (on-demand baseline): ${result.cheapestProviderId}`,
        fontSize: 10,
      },
      ...reportContextRows(options).map((row) => ({
        text: `${row[0]}: ${row[1]}`,
        fontSize: 10,
      })),
      { text: '', fontSize: 10 },
      { text: 'Data freshness', fontSize: 14 },
      ...dataFreshnessRows(options)
        .slice(1)
        .map((row) => ({
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
      ...tableLines(
        ['Provider', 'Rank', 'Eligible', 'Monthly', 'Yearly', 'Delta', 'Evidence note'],
        providerRankingRows(result, options)
          .slice(1)
          // Source columns: 0 provider, 1 rank (already '#1'), 2 eligible,
          // 5 monthly, 6 yearly, 7 delta vs lowest, 10 evidence note.
          .map((row) => [
            providerBrand(cellText(row, 0)).label,
            cellText(row, 1),
            cellText(row, 2),
            `$${cellText(row, 5)}`,
            `$${cellText(row, 6)}`,
            `$${cellText(row, 7)}`,
            cellText(row, 10),
          ]),
        [1.1, 0.5, 0.7, 0.9, 0.9, 0.7, 2.6],
        ['left', 'left', 'left', 'right', 'right', 'right', 'left'],
      ),
      { text: '', fontSize: 10 },
      { text: 'Workload scope', fontSize: 14 },
      ...workloadScopeRows(result)
        .slice(1)
        .map((row) => ({
          text: `${row[0]}: ${row[1]}`,
          fontSize: 10,
        })),
      ...sourceDiagramPdfLines(result),
      { text: '', fontSize: 10 },
      { text: 'Architecture overview', fontSize: 14 },
      ...tableLines(
        ['Category', 'Requirement', 'AWS', 'Azure', 'GCP', 'Confidence'],
        architectureOverviewRows(result)
          .slice(1)
          .map((row) => [
            cellText(row, 0),
            cellText(row, 1),
            cellText(row, 2),
            cellText(row, 3),
            cellText(row, 4),
            cellText(row, 5),
          ]),
        [1, 1.6, 1.9, 1.9, 1.9, 1],
      ),
      { text: '', fontSize: 10 },
      { text: 'FinOps summary', fontSize: 14 },
      ...buildReportInsights(result).map((insight) => ({
        text: `${insight.label}: ${insight.value}`,
        fontSize: 10,
      })),
      { text: '', fontSize: 10 },
      { text: 'Provider totals', fontSize: 14 },
    ];

    lines.push(
      ...tableLines(
        ['Provider', 'Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly'],
        result.providers.map((provider) => [
          providerBrand(provider.providerId).label,
          `$${provider.totals.daily}`,
          `$${provider.totals.weekly}`,
          `$${provider.totals.monthly}`,
          `$${provider.totals.quarterly}`,
          `$${provider.totals.yearly}`,
        ]),
        [1.4, 1, 1, 1, 1, 1],
        ['left', 'right', 'right', 'right', 'right', 'right'],
      ),
    );

    lines.push({ text: '', fontSize: 10 }, { text: 'Provider cost detail', fontSize: 14 });
    lines.push(
      ...tableLines(
        ['Scope', 'Provider', 'Category', 'Service', 'Monthly', 'Share', 'Basis'],
        providerCostDetailRows(result)
          .slice(1)
          .map((row) => [
            cellText(row, 0),
            cellText(row, 1).toUpperCase(),
            cellText(row, 2),
            cellText(row, 3),
            `$${cellText(row, 7)}`,
            cellText(row, 8),
            cellText(row, 10),
          ]),
        [1.2, 0.8, 1, 1.1, 0.9, 0.7, 2.3],
        ['left', 'left', 'left', 'left', 'right', 'right', 'left'],
      ),
    );

    lines.push({ text: '', fontSize: 10 }, { text: 'Cost coverage map', fontSize: 14 });
    lines.push(
      ...tableLines(
        // Source columns: 0 provider, 1 cost dimension, 2 coverage status,
        // 3 priced rows, 5 monthly USD, 6 evidence.
        ['Provider', 'Cost dimension', 'Coverage', 'Rows', 'Monthly', 'Evidence'],
        costCoverageMapRows(result)
          .slice(1)
          .map((row) => [
            providerBrand(cellText(row, 0)).label,
            cellText(row, 1),
            cellText(row, 2),
            cellText(row, 3),
            row[5] ? `$${row[5]}` : 'n/a',
            cellText(row, 6),
          ]),
        [1, 1.7, 0.9, 0.5, 0.9, 2],
        ['left', 'left', 'left', 'right', 'right', 'left'],
      ),
    );

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
        text: `${row[0]} | ${row[1]} | available ${row[2]} | estimate ${row[3]} | monthly $${row[5]} | upfront $${row[6] || 'n/a'} | payment ${row[7]} | term ${row[8]} | TCO $${row[9] || 'n/a'} | savings ${row[10] || 'n/a'}`,
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

function sourceDiagramPdfLines(result: ComparisonResult): PdfLine[] {
  const rows = sourceDiagramRows(result);

  if (rows.length === 0) {
    return [];
  }

  return [
    { text: '', fontSize: 10 },
    { text: 'Source diagram', fontSize: 14 },
    ...rows.slice(1).map((row) => ({
      text: `${row[0]}: ${row[1]}`,
      fontSize: 10,
    })),
  ];
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
    ...pdfParagraph(
      CHART_ORIGIN_X,
      220,
      11,
      'Executive readout: validate regional SKU availability, resilience, and transfer paths before vendor commitment.',
      CHART_TEXT_WIDTH,
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
    ...pdfParagraph(
      CHART_ORIGIN_X,
      210,
      10,
      'Line-item source: same evidence rows used by CSV and XLSX exports; approximate mappings remain labeled in the text section.',
      CHART_TEXT_WIDTH,
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

// Colours come from report-brand.ts so a provider looks the same here, in the
// spreadsheet tab colour and in the table headers. These used to be per-file
// approximations.
function providerColor(providerId: ComparisonResult['providers'][number]['providerId']): RgbColor {
  return hexToRgb(providerBrand(providerId).primary);
}

function categoryColor(category: string): RgbColor {
  return hexToRgb(brandCategoryColor(category));
}

function filledRect(x: number, y: number, width: number, height: number, color: RgbColor): string {
  return `${rgb(color)} rg\n${formatPdfNumber(x)} ${formatPdfNumber(y)} ${formatPdfNumber(
    width,
  )} ${formatPdfNumber(height)} re f`;
}

/**
 * Wrapped text for the chart pages.
 *
 * pdfText draws a single unwrapped run, so the long footnotes on these pages
 * ran off the right edge of the paper and the last words were simply lost.
 */
export function pdfParagraph(
  x: number,
  y: number,
  fontSize: number,
  text: string,
  maxWidth: number,
  color: RgbColor = TEXT_COLOR,
): string[] {
  const words = text.split(' ');
  const rows: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;

    if (textWidth(candidate, fontSize) > maxWidth && current.length > 0) {
      rows.push(current);
      current = word;
      continue;
    }

    current = candidate;
  }

  if (current.length > 0) {
    rows.push(current);
  }

  return rows.map((row, index) => pdfText(x, y - index * (fontSize + 3), fontSize, row, color));
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

export function wrapLine(line: PdfLine): PdfLine[] {
  // A table row is laid out per cell and truncates to its column width. Wrapping
  // it would split one record over several lines and drop the cell positions,
  // turning the table back into the prose this replaced.
  if (line.cells) {
    return [line];
  }

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


function selectedScenarioPdfText(row: string[]): string {
  if (row[1] === 'no') {
    return `${row[0]}: not eligible for selected model | ${row[7]}`;
  }

  return `${row[0]}: eligible yes | estimate ${row[5]} | source ${row[6]} | selected $${row[2]} | monthly $${row[3]} | ${row[7]}`;
}

export function pageContent(lines: PdfLine[]): string {
  // Fills first: rectangles cannot be drawn inside a BT/ET text block, and a
  // background painted afterwards would cover the text it is meant to sit behind.
  const fills: string[] = [];

  lines.forEach((line, index) => {
    if (!line.fill) {
      return;
    }

    const y = 750 - index * ROW_HEIGHT;
    fills.push(
      filledRect(PAGE_MARGIN - 4, y - 4, CONTENT_WIDTH + 8, ROW_HEIGHT - 2, line.fill),
    );
  });

  const commands = [...fills, 'BT'];

  lines.forEach((line, index) => {
    const y = 750 - index * ROW_HEIGHT;
    // Anything set above body size is a heading, so give it the bold face unless
    // the caller says otherwise. Body copy stays regular.
    const bold = line.bold ?? line.fontSize >= HEADING_FONT_SIZE;
    const font = bold ? 'F2' : 'F1';

    commands.push(`/${font} ${line.fontSize} Tf`, rgb(line.textColor ?? TEXT_COLOR) + ' rg');

    if (!line.cells) {
      commands.push(`1 0 0 1 ${PAGE_MARGIN} ${y} Tm`, `(${escapePdfText(line.text)}) Tj`);
      return;
    }

    let x = PAGE_MARGIN;
    for (const cell of line.cells) {
      const text = truncateToWidth(cell.text, cell.width, line.fontSize);
      // Right alignment matters for money: a column of costs that does not line
      // up on the decimal cannot be scanned.
      const offset =
        cell.align === 'right' ? Math.max(0, cell.width - textWidth(text, line.fontSize)) : 0;

      commands.push(`1 0 0 1 ${formatPdfNumber(x + offset)} ${y} Tm`, `(${escapePdfText(text)}) Tj`);
      x += cell.width + COLUMN_GAP;
    }
  });

  commands.push('ET');

  return commands.join('\n');
}

/** Helvetica is ~0.52em average across mixed-case text; good enough to lay out columns. */
/**
 * Reads a cell from an evidence row, defaulting to empty.
 *
 * One helper rather than `String(row[n] ?? '')` repeated at every call site:
 * the fallback lives in a single place, and it is one branch to reason about
 * instead of thirty.
 */
export function cellText(row: string[], index: number): string {
  return String(row[index] ?? '');
}

export function textWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.52;
}

export function truncateToWidth(text: string, width: number, fontSize: number): string {
  if (textWidth(text, fontSize) <= width) {
    return text;
  }

  const maxCharacters = Math.max(1, Math.floor(width / (fontSize * 0.52)) - 1);
  return `${text.slice(0, maxCharacters).trimEnd()}...`;
}

/**
 * Builds a table: a filled header band, then zebra-striped rows.
 *
 * Column widths are supplied as weights and scaled to the content width, so a
 * caller describes proportions rather than doing point arithmetic.
 */
export function tableLines(
  headers: string[],
  rows: string[][],
  weights: number[],
  aligns: Array<'left' | 'right'> = [],
): PdfLine[] {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const available = CONTENT_WIDTH - COLUMN_GAP * (weights.length - 1);
  const widths = weights.map((weight) => (weight / totalWeight) * available);

  const toCells = (values: string[]): PdfCell[] =>
    widths.map((width, index) => ({
      text: values[index] ?? '',
      width,
      align: aligns[index] ?? 'left',
    }));

  return [
    {
      text: headers.join(' '),
      fontSize: 9,
      bold: true,
      cells: toCells(headers),
      fill: HEADER_BAND_COLOR,
      textColor: HEADER_TEXT_COLOR,
    },
    ...rows.map((row, index) => ({
      text: row.join(' '),
      fontSize: 9,
      cells: toCells(row),
      // Banding, not borders: at nine point a ruled grid is heavier than the
      // data it separates.
      ...(index % 2 === 1 ? { fill: ZEBRA_COLOR } : {}),
    })),
  ];
}

// Page furniture: a hairline rule and "Page N of M", so a printed or emailed
// report can be reassembled and cited page-by-page.
function pageFooter(pageNumber: number, totalPages: number): string {
  const label = `PolyCost Comparison Report  |  Page ${pageNumber} of ${totalPages}`;

  return [
    '0.83 0.86 0.90 RG',
    '0.5 w',
    '50 58 m',
    '562 58 l',
    'S',
    'BT',
    '0.36 0.39 0.45 rg',
    '/F1 8 Tf',
    '1 0 0 1 50 44 Tm',
    `(${escapePdfText(label)}) Tj`,
    'ET',
    '0 0 0 rg',
  ].join('\n');
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
