import { Injectable } from '@nestjs/common';
import {
  DecodedDiagramInput,
  DiagramExtractor,
  DiagramGraphEdge,
  ExtractedDiagram,
  ExtractedDiagramNode,
} from './diagram-parser.types.js';
import { sanitizeDisplayText, sanitizeSourceRef } from './diagram-security.js';

@Injectable()
export class LucidCsvExtractor implements DiagramExtractor {
  readonly format = 'lucid_csv' as const;

  extract(input: DecodedDiagramInput): ExtractedDiagram {
    const rows = parseCsv(input.text ?? input.buffer.toString('utf8'));
    const [headerRow, ...dataRows] = rows;
    const headers = headerRow.map((header) => normalizeHeader(header));
    const nodes: ExtractedDiagramNode[] = [];
    const edges: DiagramGraphEdge[] = [];

    dataRows.forEach((row, rowIndex) => {
      const record = new Map(headers.map((header, index) => [header, row.at(index) ?? '']));
      const id =
        firstNonEmpty(
          readRecord(record, 'id'),
          readRecord(record, 'shape id'),
          readRecord(record, 'object id'),
        ) ?? `row-${rowIndex + 2}`;
      const sourceId = firstNonEmpty(
        readRecord(record, 'source'),
        readRecord(record, 'line source'),
        readRecord(record, 'from'),
        readRecord(record, 'source id'),
      );
      const targetId = firstNonEmpty(
        readRecord(record, 'target'),
        readRecord(record, 'line destination'),
        readRecord(record, 'to'),
        readRecord(record, 'destination id'),
      );

      if (sourceId && targetId) {
        const edgeLabel = firstNonEmpty(readRecord(record, 'text'), readRecord(record, 'label'));

        edges.push({
          id,
          sourceId,
          targetId,
          ...(edgeLabel ? { displayLabel: sanitizeDisplayText(edgeLabel, 'connection') } : {}),
        });
        return;
      }

      const label =
        firstNonEmpty(
          readRecord(record, 'name'),
          readRecord(record, 'text'),
          readRecord(record, 'label'),
          readRecord(record, 'title'),
          readRecord(record, 'shape'),
        ) ?? id;
      const stencilId = firstNonEmpty(
        readRecord(record, 'shape'),
        readRecord(record, 'type'),
        readRecord(record, 'library'),
        readRecord(record, 'stencil'),
      );

      nodes.push({
        id,
        rawLabel: sanitizeDisplayText(label, id),
        stencilId: stencilId ? sanitizeDisplayText(stencilId, stencilId) : undefined,
        sourceRef: sanitizeSourceRef('lucid_csv', id),
      });
    });

    return {
      format: this.format,
      nodes,
      edges,
    };
  }
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input.charAt(index);
    const next = input.charAt(index + 1);

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === ',' && !quoted) {
      row.push(cell.trim());
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      row.push(cell.trim());
      cell = '';
      if (row.some(Boolean)) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  if (row.some(Boolean)) {
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase();
}

function readRecord(record: ReadonlyMap<string, string>, header: string): string | undefined {
  return record.get(header);
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value !== undefined && value.trim().length > 0)?.trim();
}
