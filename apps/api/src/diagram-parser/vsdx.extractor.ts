import { Injectable } from '@nestjs/common';
import {
  DecodedDiagramInput,
  DiagramExtractor,
  DiagramGraphEdge,
  ExtractedDiagram,
  ExtractedDiagramNode,
} from './diagram-parser.types';
import { assertXmlSafe, sanitizeDisplayText, sanitizeSourceRef } from './diagram-security';
import { readZipEntries } from './zip-reader';

@Injectable()
export class VsdxExtractor implements DiagramExtractor {
  readonly format = 'vsdx' as const;

  extract(input: DecodedDiagramInput): ExtractedDiagram {
    const entries = readZipEntries(input.buffer, /^visio\/pages\/page\d+\.xml$/i);
    const nodes = new Map<string, ExtractedDiagramNode>();
    const edges: DiagramGraphEdge[] = [];

    for (const entry of entries) {
      const xml = entry.content.toString('utf8');
      assertXmlSafe(xml);

      for (const node of extractShapes(xml, entry.path)) {
        nodes.set(node.id, node);
      }

      edges.push(...extractConnections(xml, entry.path));
    }

    return {
      format: this.format,
      nodes: [...nodes.values()],
      edges,
    };
  }
}

function extractShapes(xml: string, path: string): ExtractedDiagramNode[] {
  const nodes: ExtractedDiagramNode[] = [];
  const shapePattern = /<Shape\b([^>]*)>([\s\S]*?)<\/Shape>/gi;
  const pageName = pageNameFromPath(path);
  let match: RegExpExecArray | null;

  while ((match = shapePattern.exec(xml))) {
    const attributes = parseXmlAttributes(match[1]);
    const id = attributes.ID ?? attributes.Id ?? attributes.id;

    if (!id) {
      continue;
    }

    const text = match[2].match(/<Text[^>]*>([\s\S]*?)<\/Text>/i)?.[1];
    const label = sanitizeDisplayText(
      text ?? attributes.NameU ?? attributes.Name ?? attributes.Master ?? '',
      id,
    );
    const cells = extractCells(match[2]);
    const bounds = boundsFromCells(cells);
    const fillColor = colorFromCell(cells.get('FillForegnd') ?? cells.get('FillBkgnd'));
    const lineColor = colorFromCell(cells.get('LineColor'));

    nodes.push({
      id,
      rawLabel: label,
      stencilId: attributes.NameU ?? attributes.Name ?? attributes.Master,
      sourceRef: sanitizeSourceRef('vsdx', `${path}:${id}`),
      ...(bounds ? { bounds } : {}),
      visual: {
        pageRef: path,
        pageName,
        ...(attributes.Master ? { masterId: attributes.Master } : {}),
        ...(fillColor ? { fillColor } : {}),
        ...(lineColor ? { lineColor } : {}),
      },
    });
  }

  return nodes;
}

function extractCells(shapeXml: string): Map<string, string> {
  const cells = new Map<string, string>();
  const cellPattern = /<Cell\b([^>]*)\/?>/gi;
  let match: RegExpExecArray | null;

  while ((match = cellPattern.exec(shapeXml))) {
    const attributes = parseXmlAttributes(match[1]);
    const name = attributes.N ?? attributes.n;
    const value = attributes.V ?? attributes.v ?? attributes.F ?? attributes.f;

    if (name && value !== undefined) {
      cells.set(name, value);
    }
  }

  return cells;
}

function boundsFromCells(cells: Map<string, string>):
  | {
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | undefined {
  const pinX = parseNumberCell(cells.get('PinX'));
  const pinY = parseNumberCell(cells.get('PinY'));
  const width = parseNumberCell(cells.get('Width'));
  const height = parseNumberCell(cells.get('Height'));

  if (
    pinX === undefined ||
    pinY === undefined ||
    width === undefined ||
    height === undefined ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }

  return {
    x: roundLayout(pinX - width / 2),
    y: roundLayout(pinY - height / 2),
    width: roundLayout(width),
    height: roundLayout(height),
  };
}

function parseNumberCell(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function colorFromCell(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const hex = value.match(/#?[0-9a-f]{6}/i)?.[0];

  if (hex) {
    return hex.startsWith('#') ? hex.toUpperCase() : `#${hex.toUpperCase()}`;
  }

  const rgb = value.match(/RGB\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)/i);

  if (!rgb) {
    return undefined;
  }

  const channels = rgb.slice(1).map((channel) => Number.parseInt(channel, 10));

  if (channels.some((channel) => channel < 0 || channel > 255)) {
    return undefined;
  }

  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function pageNameFromPath(path: string): string {
  return path.match(/page(\d+)\.xml$/i)?.[1] ? `Page ${path.match(/page(\d+)\.xml$/i)?.[1]}` : path;
}

function roundLayout(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function extractConnections(xml: string, path: string): DiagramGraphEdge[] {
  const edges: DiagramGraphEdge[] = [];
  const connectPattern = /<Connect\b([^>]*)\/?>/gi;
  let match: RegExpExecArray | null;

  while ((match = connectPattern.exec(xml))) {
    const attributes = parseXmlAttributes(match[1]);
    const sourceId = attributes.FromSheet;
    const targetId = attributes.ToSheet;

    if (!sourceId || !targetId || sourceId === targetId) {
      continue;
    }

    edges.push({
      id: sanitizeSourceRef('vsdx', `${path}:${sourceId}-${targetId}-${edges.length + 1}`),
      sourceId,
      targetId,
    });
  }

  return edges;
}

function parseXmlAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributePattern = /([\w:-]+)="([^"]*)"/g;
  let match: RegExpExecArray | null;

  while ((match = attributePattern.exec(source))) {
    attributes[match[1]] = match[2];
  }

  return attributes;
}
