import { NormalizedRequirementCategory } from '@polycost/types';
import { NormalizedWorkloadSpec, ServiceRequirement } from '../nws/nws.types';
import { ParserConfidence } from '../nws-parser/nws-parser.types';

export const DIAGRAM_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const DIAGRAM_INFLATED_MAX_BYTES = 20 * 1024 * 1024;
export const DIAGRAM_JSON_BODY_MAX_BYTES = 8 * 1024 * 1024;
export const DIAGRAM_TEMP_RETENTION_HOURS = 24;
export const DIAGRAM_MAX_NODES = 200;
export const DIAGRAM_MAX_EDGES = 500;
export const DIAGRAM_LLM_MAX_NODES_PER_PARSE = 20;

export type DiagramInputFormat = 'mermaid' | 'drawio' | 'lucid_csv' | 'vsdx';
export type DiagramEncoding = 'text' | 'base64';
export type DiagramNodeKind = 'resource' | 'connector' | 'decorative' | 'unknown';
export type DiagramClassificationConfidence = 'high' | 'moderate' | 'low';

export interface DiagramParseRequest {
  content: string;
  encoding?: DiagramEncoding;
  fileName?: string;
  mimeType?: string;
  inputFormat?: DiagramInputFormat | 'auto';
}

export interface DecodedDiagramInput {
  buffer: Buffer;
  text?: string;
  sizeBytes: number;
  sha256: string;
  requestedFormat?: DiagramInputFormat | 'auto';
  detectedFormat: DiagramInputFormat;
  fileName?: string;
  mimeType?: string;
}

export interface DiagramGraph {
  format: DiagramInputFormat;
  nodes: DiagramGraphNode[];
  edges: DiagramGraphEdge[];
  ignoredNodes: DiagramIgnoredNode[];
}

export interface DiagramGraphNode {
  id: string;
  displayLabel: string;
  kind: DiagramNodeKind;
  sourceRef: string;
  stencilId?: string;
  bounds?: DiagramNodeBounds;
  visual?: DiagramNodeVisualMetadata;
}

export interface DiagramGraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  displayLabel?: string;
}

export interface DiagramIgnoredNode {
  id: string;
  displayLabel: string;
  reason: string;
  sourceRef: string;
}

export interface ExtractedDiagram {
  format: DiagramInputFormat;
  nodes: ExtractedDiagramNode[];
  edges: DiagramGraphEdge[];
  extractionWarnings?: DiagramIgnoredNode[];
}

export interface ExtractedDiagramNode {
  id: string;
  rawLabel: string;
  style?: string;
  stencilId?: string;
  sourceRef: string;
  bounds?: DiagramNodeBounds;
  visual?: DiagramNodeVisualMetadata;
}

export interface DiagramNodeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DiagramNodeVisualMetadata {
  pageRef?: string;
  pageName?: string;
  masterId?: string;
  masterName?: string;
  containerId?: string;
  fillColor?: string;
  lineColor?: string;
}

export interface DiagramExtractor {
  readonly format: DiagramInputFormat;
  extract(input: DecodedDiagramInput): ExtractedDiagram;
}

export interface ClassifiedDiagramNode extends DiagramGraphNode {
  classification?: DiagramNodeClassification;
}

export interface DiagramNodeClassification {
  serviceCategory: NormalizedRequirementCategory;
  serviceType: string;
  confidence: DiagramClassificationConfidence;
  reason: string;
  assumedDefaults: string[];
  serviceRequirement: ServiceRequirement;
}

export interface DiagramReviewComponent {
  nodeId: string;
  displayLabel: string;
  serviceCategory: NormalizedRequirementCategory;
  serviceType: string;
  confidence: DiagramClassificationConfidence;
  sourceRef: string;
  assumedDefaults: string[];
  evidence: string;
  editable: true;
}

export interface DiagramParseResult {
  importId: string;
  parserConfidence: ParserConfidence;
  fieldsRequiringReview: string[];
  source: {
    format: DiagramInputFormat;
    fileName?: string;
    mimeType?: string;
    sizeBytes: number;
    sha256: string;
    parsedAt: string;
    persisted: boolean;
    tempFileStored: boolean;
    expiresAt?: string;
  };
  graph: DiagramGraph;
  review: {
    components: DiagramReviewComponent[];
    unresolvedClassifications: DiagramIgnoredNode[];
    ignoredNodes: DiagramIgnoredNode[];
    assumedDefaults: string[];
  };
  draftNws: NormalizedWorkloadSpec;
}

export interface LlmClassifierClient {
  classify(input: {
    displayLabel: string;
    diagramNodeId?: string;
    stencilId?: string;
  }): Promise<DiagramNodeClassification | undefined> | DiagramNodeClassification | undefined;
  lastFailureReason?(): string | undefined;
}

export interface DiagramImportRecordInput {
  importId: string;
  format: DiagramInputFormat;
  fileName?: string;
  mimeType?: string;
  sizeBytes: number;
  sha256: string;
  tempFileRef?: string;
  expiresAt?: string;
  parserConfidence: ParserConfidence;
  unresolvedCount: number;
  ignoredCount: number;
  graph: DiagramGraph;
  draftNws: NormalizedWorkloadSpec;
}
