import { Injectable } from '@nestjs/common';
import {
  DecodedDiagramInput,
  DiagramExtractor,
  DiagramGraphEdge,
  DiagramIgnoredNode,
  ExtractedDiagram,
  ExtractedDiagramNode,
} from './diagram-parser.types.js';
import { assertXmlSafe, sanitizeDisplayText, sanitizeSourceRef } from './diagram-security.js';
import { readZipEntries } from './zip-reader.js';

@Injectable()
export class VsdxExtractor implements DiagramExtractor {
  readonly format = 'vsdx' as const;

  extract(input: DecodedDiagramInput): ExtractedDiagram {
    const entries = readZipEntries(input.buffer, /^visio\/pages\/page\d+\.xml$/i);
    const pageMetadata = extractPageMetadata(
      readZipEntries(input.buffer, /^visio\/pages\/pages\.xml$/i),
      readZipEntries(input.buffer, /^visio\/pages\/_rels\/pages\.xml\.rels$/i),
      entries.map((entry) => entry.path),
    );
    const masters = extractMasters(
      readZipEntries(input.buffer, /^visio\/masters\/master\d+\.xml$/i),
    );
    const nodes = new Map<string, ExtractedDiagramNode>();
    const edges: DiagramGraphEdge[] = [];
    const extractionWarnings: DiagramIgnoredNode[] = [];

    for (const entry of entries) {
      const xml = entry.content.toString('utf8');
      assertXmlSafe(xml);

      try {
        assertPageXmlParseable(xml, entry.path);

        for (const node of extractShapes(
          xml,
          entry.path,
          masters,
          pageMetadata.get(entry.path),
          extractPageGeometry(xml),
        )) {
          nodes.set(node.id, node);
        }

        edges.push(...extractConnections(xml, entry.path));
      } catch (error) {
        extractionWarnings.push(pageParseWarning(entry.path, error));
      }
    }

    return {
      format: this.format,
      nodes: [...nodes.values()],
      edges,
      ...(extractionWarnings.length > 0 ? { extractionWarnings } : {}),
    };
  }
}

interface VsdxMasterMetadata {
  id: string;
  name?: string;
  label?: string;
}

interface VsdxPageMetadata {
  id?: string;
  name?: string;
}

interface VsdxPageGeometry {
  width?: number;
  height?: number;
}

function extractPageMetadata(
  pageEntries: Array<{ path: string; content: Buffer }>,
  relationshipEntries: Array<{ path: string; content: Buffer }>,
  pagePaths: string[],
): Map<string, VsdxPageMetadata> {
  const metadata = new Map<string, VsdxPageMetadata>();
  const pageXml = pageEntries[0]?.content.toString('utf8');

  if (!pageXml) {
    return metadata;
  }

  assertXmlSafe(pageXml);
  const relationshipMap = extractPageRelationships(relationshipEntries);
  const orderedPagePathQueue = [...pagePaths].sort(comparePagePaths);
  const pagePattern = /<Page\b([^>]*)>([\s\S]*?)<\/Page>/gi;
  let match: RegExpExecArray | null;

  while ((match = pagePattern.exec(pageXml))) {
    const attributes = parseXmlAttributes(match[1]);
    const id = attributes.ID ?? attributes.Id ?? attributes.id;
    const relId = match[2].match(/\b(?:r:id|Id)="([^"]+)"/i)?.[1];
    const path =
      (relId ? relationshipMap.get(relId) : undefined) ??
      orderedPagePathQueue.shift() ??
      (id !== undefined ? `visio/pages/page${Number.parseInt(id, 10) + 1}.xml` : undefined);
    const name = attributes.Name ?? attributes.NameU ?? attributes.name ?? attributes.nameU;

    if (path) {
      metadata.set(path, {
        ...(id ? { id } : {}),
        ...(name ? { name: sanitizeDisplayText(name, pageNameFromPath(path)) } : {}),
      });
    }
  }

  return metadata;
}

function extractPageRelationships(
  entries: Array<{ path: string; content: Buffer }>,
): Map<string, string> {
  const relationships = new Map<string, string>();
  const xml = entries[0]?.content.toString('utf8');

  if (!xml) {
    return relationships;
  }

  assertXmlSafe(xml);
  const relationshipPattern = /<Relationship\b([^>]*)\/?>/gi;
  let match: RegExpExecArray | null;

  while ((match = relationshipPattern.exec(xml))) {
    const attributes = parseXmlAttributes(match[1]);
    const id = attributes.Id ?? attributes.ID ?? attributes.id;
    const target = attributes.Target ?? attributes.target;

    if (id && target) {
      relationships.set(id, normalizePageTarget(target));
    }
  }

  return relationships;
}

function extractMasters(
  entries: Array<{ path: string; content: Buffer }>,
): Map<string, VsdxMasterMetadata> {
  const masters = new Map<string, VsdxMasterMetadata>();

  for (const entry of entries) {
    const xml = entry.content.toString('utf8');
    assertXmlSafe(xml);
    const masterAttributes = parseXmlAttributes(xml.match(/<Master\b([^>]*)>/i)?.[1] ?? '');
    const shapeAttributes = parseXmlAttributes(xml.match(/<Shape\b([^>]*)>/i)?.[1] ?? '');
    const id = masterAttributes.ID ?? masterAttributes.Id ?? masterAttributes.id;

    if (!id) {
      continue;
    }

    const text = xml.match(/<Text[^>]*>([\s\S]*?)<\/Text>/i)?.[1];
    masters.set(id, {
      id,
      name:
        masterAttributes.NameU ??
        masterAttributes.Name ??
        shapeAttributes.NameU ??
        shapeAttributes.Name,
      label: text ? sanitizeDisplayText(text, id) : undefined,
    });
  }

  return masters;
}

function extractShapes(
  xml: string,
  path: string,
  masters: Map<string, VsdxMasterMetadata>,
  pageMetadata: VsdxPageMetadata | undefined,
  pageGeometry: VsdxPageGeometry,
): ExtractedDiagramNode[] {
  const nodes: ExtractedDiagramNode[] = [];
  const shapePattern = /<Shape\b([^>]*)>([\s\S]*?)<\/Shape>/gi;
  const pageName = pageMetadata?.name ?? pageNameFromPath(path);
  let match: RegExpExecArray | null;

  while ((match = shapePattern.exec(xml))) {
    const attributes = parseXmlAttributes(match[1]);
    const id = attributes.ID ?? attributes.Id ?? attributes.id;

    if (!id) {
      continue;
    }

    const text = match[2].match(/<Text[^>]*>([\s\S]*?)<\/Text>/i)?.[1];
    const master = attributes.Master ? masters.get(attributes.Master) : undefined;
    const label = sanitizeDisplayText(
      text ?? attributes.NameU ?? attributes.Name ?? master?.label ?? master?.name ?? '',
      id,
    );
    const cells = extractCells(match[2]);
    const bounds = boundsFromCells(cells);
    const fillColor = colorFromCell(cells.get('FillForegnd') ?? cells.get('FillBkgnd'));
    const lineColor = colorFromCell(cells.get('LineColor'));
    const normalizedBounds =
      bounds && pageGeometry.width !== undefined && pageGeometry.height !== undefined
        ? normalizedBoundsFromPage(bounds, {
            width: pageGeometry.width,
            height: pageGeometry.height,
          })
        : undefined;

    const stencilId = attributes.NameU ?? attributes.Name ?? master?.name ?? attributes.Master;

    nodes.push({
      id,
      rawLabel: label,
      stencilId,
      sourceRef: sanitizeSourceRef('vsdx', `${path}:${id}`),
      ...(bounds ? { bounds } : {}),
      visual: {
        pageRef: path,
        pageId: pageMetadata?.id ?? pageIdFromPath(path),
        pageName,
        ...(pageGeometry.width ? { pageWidth: pageGeometry.width } : {}),
        ...(pageGeometry.height ? { pageHeight: pageGeometry.height } : {}),
        ...(attributes.Master ? { masterId: attributes.Master } : {}),
        ...(master?.name ? { masterName: master.name } : {}),
        ...(attributes.Parent ? { containerId: attributes.Parent } : {}),
        ...(attributes.Container ? { containerId: attributes.Container } : {}),
        ...(fillColor ? { fillColor } : {}),
        ...(lineColor ? { lineColor } : {}),
        ...(normalizedBounds ? { normalizedBounds } : {}),
        geometryHint: geometryHint(attributes, cells),
        renderingMode: 'layout-extraction',
        renderingWarnings: ['layout extraction is not full Visio visual rendering'],
      },
    });
  }

  return withContainerLabels(nodes);
}

function withContainerLabels(nodes: ExtractedDiagramNode[]): ExtractedDiagramNode[] {
  const labelsById = new Map(nodes.map((node) => [node.id, node.rawLabel]));

  return nodes.map((node) => {
    const containerId = node.visual?.containerId;
    const containerLabel =
      containerId && containerId !== node.id ? labelsById.get(containerId) : undefined;

    if (!containerLabel || !node.visual) {
      return node;
    }

    return {
      ...node,
      visual: {
        ...node.visual,
        containerLabel,
      },
    };
  });
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

function extractPageGeometry(xml: string): VsdxPageGeometry {
  const pageSheetXml = xml.match(/<PageSheet\b[^>]*>([\s\S]*?)<\/PageSheet>/i)?.[1];

  if (!pageSheetXml) {
    return {};
  }

  const cells = extractCells(pageSheetXml);
  const width = parseNumberCell(cells.get('PageWidth'));
  const height = parseNumberCell(cells.get('PageHeight'));

  return {
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
  };
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

function normalizedBoundsFromPage(
  bounds: { x: number; y: number; width: number; height: number },
  pageGeometry: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  return {
    x: roundLayout((bounds.x / pageGeometry.width) * 100),
    y: roundLayout((bounds.y / pageGeometry.height) * 100),
    width: roundLayout((bounds.width / pageGeometry.width) * 100),
    height: roundLayout((bounds.height / pageGeometry.height) * 100),
  };
}

function geometryHint(
  attributes: Record<string, string>,
  cells: Map<string, string>,
): 'rectangle' | 'connector' | 'group' | 'unknown' {
  const name = `${attributes.NameU ?? ''} ${attributes.Name ?? ''}`.toLowerCase();
  const type = (attributes.Type ?? attributes.type ?? '').toLowerCase();

  if (type === 'group') {
    return 'group';
  }

  if (name.includes('connector') || cells.has('BeginX') || cells.has('EndX')) {
    return 'connector';
  }

  if (cells.has('Width') && cells.has('Height')) {
    return 'rectangle';
  }

  return 'unknown';
}

function pageNameFromPath(path: string): string {
  return path.match(/page(\d+)\.xml$/i)?.[1] ? `Page ${path.match(/page(\d+)\.xml$/i)?.[1]}` : path;
}

function pageIdFromPath(path: string): string {
  return `page${path.match(/page(\d+)\.xml$/i)?.[1] ?? 'unknown'}`;
}

function comparePagePaths(left: string, right: string): number {
  return pageNumberFromPath(left) - pageNumberFromPath(right);
}

function pageNumberFromPath(path: string): number {
  return Number.parseInt(path.match(/page(\d+)\.xml$/i)?.[1] ?? '999999', 10);
}

function normalizePageTarget(target: string): string {
  const normalized = target.replace(/^\/+/, '').replace(/^\.?\//, '');

  if (normalized.startsWith('visio/pages/')) {
    return normalized;
  }

  if (normalized.startsWith('pages/')) {
    return `visio/${normalized}`;
  }

  return `visio/pages/${normalized.replace(/^.*\//, '')}`;
}

function assertPageXmlParseable(xml: string, path: string): void {
  if (!/<PageContents\b/i.test(xml)) {
    throw new Error(`${pageNameFromPath(path)} is missing PageContents`);
  }

  if (!/<\/PageContents>/i.test(xml)) {
    throw new Error(`${pageNameFromPath(path)} ended before PageContents closed`);
  }
}

function pageParseWarning(path: string, error: unknown): DiagramIgnoredNode {
  const pageId = pageIdFromPath(path);
  const pageName = pageNameFromPath(path);
  const message = error instanceof Error ? error.message : 'unknown parser error';

  return {
    id: `vsdx-page-parse-error-${pageId}`,
    displayLabel: pageName,
    reason: `Unable to parse ${pageName}: ${sanitizeDisplayText(message, 'page parser error')}`,
    sourceRef: sanitizeSourceRef('vsdx', `${path}:parse-error`),
  };
}

function roundLayout(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function extractConnections(xml: string, path: string): DiagramGraphEdge[] {
  const fallbackEdges: DiagramGraphEdge[] = [];
  const connectorTargets = new Map<string, string[]>();
  const connectPattern = /<Connect\b([^>]*)\/?>/gi;
  let match: RegExpExecArray | null;

  while ((match = connectPattern.exec(xml))) {
    const attributes = parseXmlAttributes(match[1]);
    const sourceId = attributes.FromSheet;
    const targetId = attributes.ToSheet;

    if (!sourceId || !targetId || sourceId === targetId) {
      continue;
    }

    const targets = connectorTargets.get(sourceId) ?? [];
    if (!targets.includes(targetId)) {
      targets.push(targetId);
      connectorTargets.set(sourceId, targets);
    }

    fallbackEdges.push({
      id: sanitizeSourceRef('vsdx', `${path}:${sourceId}-${targetId}-${fallbackEdges.length + 1}`),
      sourceId,
      targetId,
    });
  }

  const aggregatedEdges: DiagramGraphEdge[] = [];

  for (const [connectorId, targets] of connectorTargets.entries()) {
    if (targets.length < 2) {
      continue;
    }

    const [firstTarget, ...otherTargets] = targets;

    for (const targetId of otherTargets) {
      aggregatedEdges.push({
        id: sanitizeSourceRef(
          'vsdx',
          `${path}:${connectorId}-${firstTarget}-${targetId}-${aggregatedEdges.length + 1}`,
        ),
        sourceId: firstTarget,
        targetId,
        displayLabel: 'Connector',
      });
    }
  }

  return aggregatedEdges.length > 0 ? aggregatedEdges : fallbackEdges;
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
