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

    nodes.push({
      id,
      rawLabel: label,
      stencilId: attributes.NameU ?? attributes.Name ?? attributes.Master,
      sourceRef: sanitizeSourceRef('vsdx', `${path}:${id}`),
    });
  }

  return nodes;
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
