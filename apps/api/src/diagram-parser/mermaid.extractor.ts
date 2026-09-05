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
export class MermaidExtractor implements DiagramExtractor {
  readonly format = 'mermaid' as const;

  extract(input: DecodedDiagramInput): ExtractedDiagram {
    const text = input.text ?? input.buffer.toString('utf8');
    const nodes = new Map<string, ExtractedDiagramNode>();
    const edges: DiagramGraphEdge[] = [];
    const lines = text.split(/\r?\n/);

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      if (!trimmed || shouldSkipMermaidLine(trimmed)) {
        return;
      }

      for (const node of extractMermaidNodes(trimmed, index + 1)) {
        nodes.set(node.id, node);
      }

      const edge = extractMermaidEdge(trimmed, index + 1);
      if (edge) {
        edges.push(edge);
      }
    });

    return {
      format: this.format,
      nodes: [...nodes.values()],
      edges,
    };
  }
}

function extractMermaidNodes(line: string, lineNumber: number): ExtractedDiagramNode[] {
  const nodes: ExtractedDiagramNode[] = [];
  const nodePattern = /\b([A-Za-z][\w-]*)\s*(?:\[(.*?)\]|\(\((.*?)\)\)|\((.*?)\)|\{(.*?)\})/g;
  let match: RegExpExecArray | null;

  while ((match = nodePattern.exec(line))) {
    const id = match[1];
    const label = match[2] ?? match[3] ?? match[4] ?? match[5] ?? id;

    nodes.push({
      id,
      rawLabel: sanitizeDisplayText(label, id),
      sourceRef: sanitizeSourceRef('mermaid', `line-${lineNumber}-${id}`),
    });
  }

  if (nodes.length === 0) {
    const bareNode = line.match(/^([A-Za-z][\w-]*)$/);
    if (bareNode) {
      nodes.push({
        id: bareNode[1],
        rawLabel: bareNode[1],
        sourceRef: sanitizeSourceRef('mermaid', `line-${lineNumber}-${bareNode[1]}`),
      });
    }
  }

  return nodes;
}

function extractMermaidEdge(line: string, lineNumber: number): DiagramGraphEdge | undefined {
  const edgeMatch = line.match(
    /\b([A-Za-z][\w-]*)\b.*?(?:-->|---|-.->|==>)\s*\b([A-Za-z][\w-]*)\b/,
  );

  if (!edgeMatch) {
    return undefined;
  }

  return {
    id: `mermaid-edge-${lineNumber}`,
    sourceId: edgeMatch[1],
    targetId: edgeMatch[2],
  };
}

function shouldSkipMermaidLine(line: string): boolean {
  return /^(flowchart|graph|subgraph|end\b|classDef|class\b|style\b|linkStyle\b|click\b)/i.test(
    line,
  );
}
