import { Injectable } from '@nestjs/common';
import { ComparisonResult } from '../comparison/comparison.types';
import {
  decisionSummaryRows,
  lineItemEvidenceRows,
  pricingModelAvailabilityRows,
  providerRankingRows,
  reportAssumptionRows,
  reportContextRows,
  selectedScenarioRows,
  serviceRequirementRows,
  workloadScopeRows,
} from './report-evidence';
import { buildReportInsights } from './report-insights';
import { escapePdfText } from './report-security';
import { ReportOptions } from './report.types';

interface PdfLine {
  text: string;
  fontSize: number;
}

const LINES_PER_PAGE = 42;

@Injectable()
export class PdfReportGenerator {
  generate(result: ComparisonResult, options: ReportOptions = {}): Buffer {
    const lines = this.lines(result, options);
    const pages = chunk(lines, LINES_PER_PAGE);
    const objects: string[] = [];
    const pageObjectNumbers: number[] = [];

    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    objects.push('');
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

    for (const page of pages) {
      const pageObjectNumber = objects.length + 1;
      const contentObjectNumber = objects.length + 2;
      pageObjectNumbers.push(pageObjectNumber);
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`,
      );
      const content = pageContent(page);
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
