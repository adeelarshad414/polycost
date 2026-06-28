import { Injectable } from '@nestjs/common';
import { ComparisonResult } from '../comparison/comparison.types';
import { escapePdfText } from './report-security';

interface PdfLine {
  text: string;
  fontSize: number;
}

const LINES_PER_PAGE = 42;

@Injectable()
export class PdfReportGenerator {
  generate(result: ComparisonResult): Buffer {
    const lines = this.lines(result);
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

  private lines(result: ComparisonResult): PdfLine[] {
    const lines: PdfLine[] = [
      { text: 'PolyCost Comparison Report', fontSize: 18 },
      { text: `Comparison ID: ${result.comparisonId}`, fontSize: 10 },
      { text: `Pricing as of: ${result.pricingAsOf}`, fontSize: 10 },
      { text: `Cheapest provider: ${result.cheapestProviderId}`, fontSize: 10 },
      { text: '', fontSize: 10 },
      { text: 'Provider totals', fontSize: 14 },
    ];

    for (const provider of result.providers) {
      lines.push({
        text: `${provider.providerId}: daily $${provider.totals.daily}, weekly $${provider.totals.weekly}, monthly $${provider.totals.monthly}, quarterly $${provider.totals.quarterly}, yearly $${provider.totals.yearly}`,
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
