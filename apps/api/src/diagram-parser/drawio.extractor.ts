import { Injectable } from '@nestjs/common';
import { ApiValidationError } from '../api/api-errors';
import {
  DecodedDiagramInput,
  DiagramExtractor,
  DiagramGraphEdge,
  ExtractedDiagram,
  ExtractedDiagramNode,
} from './diagram-parser.types';
import {
  assertXmlSafe,
  inflateRawDiagramPayload,
  sanitizeDisplayText,
  sanitizeSourceRef,
} from './diagram-security';

@Injectable()
export class DrawioExtractor implements DiagramExtractor {
  readonly format = 'drawio' as const;

  extract(input: DecodedDiagramInput): ExtractedDiagram {
    const xml = expandDrawioXml(input.text ?? input.buffer.toString('utf8'));
    assertXmlSafe(xml);

    const nodes: ExtractedDiagramNode[] = [];
    const edges: DiagramGraphEdge[] = [];
    const cellPattern = /<mxCell\b([^>]*)\/?>/gi;
    let match: RegExpExecArray | null;

    while ((match = cellPattern.exec(xml))) {
      const attributes = parseXmlAttributes(match[1]);
      const id = attributes.id;

      if (!id || id === '0' || id === '1') {
        continue;
      }

      if (attributes.edge === '1') {
        if (attributes.source && attributes.target) {
          edges.push({
            id,
            sourceId: attributes.source,
            targetId: attributes.target,
            ...(attributes.value
              ? { displayLabel: sanitizeDisplayText(attributes.value, 'connection') }
              : {}),
          });
        }
        continue;
      }

      const label = sanitizeDisplayText(attributes.value ?? attributes.id ?? '', id);
      nodes.push({
        id,
        rawLabel: label,
        style: attributes.style,
        stencilId: stencilFromDrawioStyle(attributes.style),
        sourceRef: sanitizeSourceRef('drawio', id),
      });
    }

    return {
      format: this.format,
      nodes,
      edges,
    };
  }
}

function expandDrawioXml(xml: string): string {
  const trimmed = xml.trim();

  if (trimmed.includes('<mxGraphModel') || trimmed.includes('<mxCell')) {
    return trimmed;
  }

  assertXmlSafe(trimmed);

  const diagramMatch = trimmed.match(/<diagram\b[^>]*>([\s\S]*?)<\/diagram>/i);
  const diagramBody = diagramMatch?.[1]?.trim();

  if (!diagramBody) {
    throw new ApiValidationError('draw.io XML did not contain diagram cells', [
      { field: 'content', issue: 'missing mxGraphModel or diagram payload' },
    ]);
  }

  if (diagramBody.includes('<mxGraphModel')) {
    return diagramBody;
  }

  const compressed = Buffer.from(diagramBody, 'base64');
  const inflated = inflateRawDiagramPayload(compressed, 'diagram');

  return decodeURIComponent(inflated);
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

function stencilFromDrawioStyle(style: string | undefined): string | undefined {
  if (!style) {
    return undefined;
  }

  const shape = style.match(/shape=([^;]+)/i)?.[1];
  const symbol = style.match(/(?:stencil|symbol|resIcon)=([^;]+)/i)?.[1];
  const image = style.match(/image=([^;]+)/i)?.[1];

  return (shape ?? symbol ?? image)?.replace(/^mxgraph\./, '');
}
