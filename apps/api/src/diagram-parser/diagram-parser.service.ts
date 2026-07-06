import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { NWSValidator } from '../nws/nws-validator';
import { NormalizedWorkloadSpec } from '../nws/nws.types';
import { ParserConfidence } from '../nws-parser/nws-parser.types';
import { normalizedRequirementsFromNws } from '../nws-parser/requirement-parser.service';
import { DrawioExtractor } from './drawio.extractor';
import {
  ClassifiedDiagramNode,
  DecodedDiagramInput,
  DiagramExtractor,
  DiagramGraph,
  DiagramGraphNode,
  DiagramIgnoredNode,
  DIAGRAM_MAX_EDGES,
  DIAGRAM_MAX_NODES,
  DiagramParseRequest,
  DiagramParseResult,
  DiagramReviewComponent,
  ExtractedDiagram,
} from './diagram-parser.types';
import { FormatDetectorService } from './format-detector.service';
import { LucidCsvExtractor } from './lucid-csv.extractor';
import { MermaidExtractor } from './mermaid.extractor';
import { NodeClassifierService } from './node-classifier.service';
import { sanitizeDisplayText } from './diagram-security';
import { VsdxExtractor } from './vsdx.extractor';

@Injectable()
export class DiagramParserService {
  private readonly extractors: Record<string, DiagramExtractor>;

  constructor(
    private readonly formatDetectorService: FormatDetectorService,
    private readonly nodeClassifierService: NodeClassifierService,
    mermaidExtractor: MermaidExtractor,
    drawioExtractor: DrawioExtractor,
    lucidCsvExtractor: LucidCsvExtractor,
    vsdxExtractor: VsdxExtractor,
  ) {
    this.extractors = {
      mermaid: mermaidExtractor,
      drawio: drawioExtractor,
      lucid_csv: lucidCsvExtractor,
      vsdx: vsdxExtractor,
    };
  }

  async parse(request: DiagramParseRequest): Promise<Omit<DiagramParseResult, 'source'>> {
    const decoded = this.formatDetectorService.decode(request);
    const extracted = this.extract(decoded);
    const { graph, classifiedNodes, review, fieldsRequiringReview } =
      await this.classify(extracted);
    const draftNws = buildDraftNws({
      graph,
      classifiedNodes,
      decoded,
    });
    const parserConfidence = parserConfidenceFor(
      review.components,
      review.unresolvedClassifications,
    );

    return {
      importId: randomUUID(),
      parserConfidence,
      fieldsRequiringReview: [...new Set([...fieldsRequiringReview, ...nwsReviewFields(draftNws)])],
      graph,
      review,
      draftNws,
    };
  }

  decode(request: DiagramParseRequest): DecodedDiagramInput {
    return this.formatDetectorService.decode(request);
  }

  private extract(decoded: DecodedDiagramInput): ExtractedDiagram {
    return this.extractors[decoded.detectedFormat].extract(decoded);
  }

  private async classify(extracted: ExtractedDiagram): Promise<{
    graph: DiagramGraph;
    classifiedNodes: ClassifiedDiagramNode[];
    review: DiagramParseResult['review'];
    fieldsRequiringReview: string[];
  }> {
    const graphNodes: DiagramGraphNode[] = [];
    const classifiedNodes: ClassifiedDiagramNode[] = [];
    const unresolvedClassifications: DiagramIgnoredNode[] = [];
    const ignoredNodes: DiagramIgnoredNode[] = [];
    const reviewComponents: DiagramReviewComponent[] = [];
    const assumedDefaults: string[] = [];
    const fieldsRequiringReview: string[] = [];

    for (const node of extracted.nodes.slice(0, DIAGRAM_MAX_NODES)) {
      const displayLabel = sanitizeDisplayText(node.rawLabel, node.id);
      const classification = await this.nodeClassifierService.classify(node);

      if ('serviceCategory' in classification) {
        const graphNode: ClassifiedDiagramNode = {
          id: node.id,
          displayLabel,
          kind: 'resource',
          sourceRef: node.sourceRef,
          ...(node.stencilId ? { stencilId: node.stencilId } : {}),
          ...(node.bounds ? { bounds: node.bounds } : {}),
          ...(node.visual ? { visual: node.visual } : {}),
          classification,
        };

        classifiedNodes.push(graphNode);
        graphNodes.push(graphNode);
        reviewComponents.push({
          nodeId: node.id,
          displayLabel,
          serviceCategory: classification.serviceCategory,
          serviceType: classification.serviceType,
          confidence: classification.confidence,
          sourceRef: node.sourceRef,
          assumedDefaults: classification.assumedDefaults,
          evidence: classification.reason,
          editable: true,
        });
        assumedDefaults.push(...classification.assumedDefaults);

        if (classification.assumedDefaults.length > 0 || classification.confidence !== 'high') {
          fieldsRequiringReview.push(`diagram.nodes.${node.id}`);
        }
        continue;
      }

      const ignored = classification;

      if (ignored.reason.startsWith('decorative')) {
        ignoredNodes.push(ignored);
        graphNodes.push({
          id: node.id,
          displayLabel,
          kind: 'decorative',
          sourceRef: node.sourceRef,
          ...(node.stencilId ? { stencilId: node.stencilId } : {}),
          ...(node.bounds ? { bounds: node.bounds } : {}),
          ...(node.visual ? { visual: node.visual } : {}),
        });
      } else {
        unresolvedClassifications.push(ignored);
        graphNodes.push({
          id: node.id,
          displayLabel,
          kind: 'unknown',
          sourceRef: node.sourceRef,
          ...(node.stencilId ? { stencilId: node.stencilId } : {}),
          ...(node.bounds ? { bounds: node.bounds } : {}),
          ...(node.visual ? { visual: node.visual } : {}),
        });
        fieldsRequiringReview.push(`diagram.nodes.${node.id}.classification`);
      }
    }

    if (extracted.nodes.length > DIAGRAM_MAX_NODES) {
      unresolvedClassifications.push({
        id: 'diagram-node-cap',
        displayLabel: 'Additional nodes not parsed',
        reason: `diagram contains ${extracted.nodes.length} nodes; parsed first ${DIAGRAM_MAX_NODES}`,
        sourceRef: 'diagram:node-cap',
      });
      fieldsRequiringReview.push('diagram.nodes.cap');
    }

    return {
      graph: {
        format: extracted.format,
        nodes: graphNodes,
        edges: extracted.edges.slice(0, DIAGRAM_MAX_EDGES),
        ignoredNodes,
      },
      classifiedNodes,
      review: {
        components: reviewComponents,
        unresolvedClassifications,
        ignoredNodes,
        assumedDefaults: [...new Set(assumedDefaults)],
      },
      fieldsRequiringReview,
    };
  }
}

function buildDraftNws({
  graph,
  classifiedNodes,
  decoded,
}: {
  graph: DiagramGraph;
  classifiedNodes: ClassifiedDiagramNode[];
  decoded: DecodedDiagramInput;
}): NormalizedWorkloadSpec {
  const serviceRequirements = classifiedNodes
    .map((node) => node.classification?.serviceRequirement)
    .filter((requirement): requirement is NonNullable<typeof requirement> => Boolean(requirement));
  const computeNodes = classifiedNodes.filter((node) =>
    ['compute', 'containers', 'application'].includes(node.classification?.serviceCategory ?? ''),
  );
  const storageNodes = classifiedNodes.filter(
    (node) => node.classification?.serviceCategory === 'storage',
  );
  const databaseNodes = classifiedNodes.filter(
    (node) => node.classification?.serviceCategory === 'database',
  );
  const networkLabels = classifiedNodes
    .filter((node) => node.classification?.serviceCategory === 'networking')
    .map((node) => `${node.displayLabel} ${node.classification?.serviceType ?? ''}`)
    .join(' ');
  const regionPreference = regionPreferenceFromNodes(classifiedNodes);

  const candidate: NormalizedWorkloadSpec = {
    schemaVersion: '1.0',
    metadata: {
      sourceType: 'drawio_diagram',
      createdAt: new Date().toISOString(),
      rawInput: `${decoded.detectedFormat}:${decoded.sha256}`,
    },
    workload: {
      name: diagramWorkloadName(decoded.fileName),
      type: workloadTypeFromNodes(classifiedNodes),
      region: {
        ...(regionPreference ? { preference: regionPreference } : {}),
        isDefault: !regionPreference,
      },
    },
    compute:
      computeNodes.length > 0
        ? computeNodes.map((node, index) => ({
            role: roleFromLabel(node.displayLabel, index, 'app'),
            instanceFamily: /gpu|ml|ai|sagemaker|vertex/i.test(node.displayLabel)
              ? ('accelerated-computing' as const)
              : ('general-purpose' as const),
            vcpu: firstNumberForUnits(node.displayLabel, ['vcpu', 'cpu', 'core']) ?? 2,
            memoryGb: firstNumberForUnits(node.displayLabel, ['gb']) ?? 8,
            instanceCount: quantityFromServiceRequirement(node) ?? 1,
            scalingType:
              node.classification?.serviceType === 'autoscaling-compute'
                ? ('autoscaling' as const)
                : ('fixed' as const),
            ...(node.classification?.serviceType === 'autoscaling-compute'
              ? {
                  autoscalingRange: {
                    min: 1,
                    max: Math.max(2, quantityFromServiceRequirement(node) ?? 2),
                  },
                }
              : {}),
          }))
        : [
            {
              role: 'application',
              instanceFamily: 'general-purpose',
              vcpu: 2,
              memoryGb: 8,
              instanceCount: 1,
              scalingType: 'fixed',
            },
          ],
    storage: storageNodes.map((node, index) => ({
      role: roleFromLabel(node.displayLabel, index, 'storage'),
      type: /file/i.test(node.classification?.serviceType ?? '')
        ? ('file' as const)
        : /block|disk|volume/i.test(node.classification?.serviceType ?? '')
          ? ('block' as const)
          : ('object' as const),
      sizeGb: storageSizeGbFromLabel(node.displayLabel) ?? 100,
      accessPattern: /archive|cold/i.test(node.displayLabel)
        ? ('archive' as const)
        : ('frequent' as const),
    })),
    database: databaseNodes.map((node, index) => ({
      role: roleFromLabel(node.displayLabel, index, 'database'),
      engine: databaseEngineFromLabel(node.displayLabel),
      sizeGb: storageSizeGbFromLabel(node.displayLabel) ?? 100,
      highAvailability: /\bha|multi.?az|replica|cluster/i.test(node.displayLabel),
    })),
    network: {
      cdn: /\bcdn|cloudfront|front door|cloud cdn\b/i.test(networkLabels),
      loadBalancer: /\bload.?balancer|alb|elb|nlb|application gateway\b/i.test(networkLabels),
      ...(networkLabels ? { estimatedMonthlyEgressGb: 500 } : {}),
      ...(networkLabels.match(/\bcdn|cloudfront|front door|cloud cdn\b/i)
        ? {
            cdnTrafficGb: 500,
            cdnCacheHitRatioPercent: 85,
          }
        : {}),
    },
    availability: {
      multiAz:
        graph.edges.length > 1 ||
        classifiedNodes.some((node) => /multi.?az|ha/i.test(node.displayLabel)),
      multiRegion: classifiedNodes.some((node) =>
        /multi.?region|active.?active/i.test(node.displayLabel),
      ),
    },
    serviceRequirements,
    sourceTraceability: classifiedNodes.map((node) => ({
      nwsPath: `serviceRequirements.${node.id}`,
      sourceRef: node.sourceRef,
    })),
  };

  return {
    ...NWSValidator.validate(candidate),
    serviceRequirements,
  };
}

function parserConfidenceFor(
  components: DiagramReviewComponent[],
  unresolved: DiagramIgnoredNode[],
): ParserConfidence {
  if (unresolved.length > 0 || components.length === 0) {
    return 'low';
  }

  if (components.some((component) => component.confidence !== 'high')) {
    return 'medium';
  }

  return 'high';
}

function nwsReviewFields(nws: NormalizedWorkloadSpec): string[] {
  const fields: string[] = [];

  if (nws.compute.some((compute) => compute.vcpu === 2 && compute.memoryGb === 8)) {
    fields.push('compute sizing');
  }

  if (nws.storage.some((storage) => storage.sizeGb === 100)) {
    fields.push('storage size');
  }

  if (nws.database.some((database) => database.sizeGb === 100)) {
    fields.push('database size');
  }

  return fields;
}

function workloadTypeFromNodes(
  nodes: ClassifiedDiagramNode[],
): NormalizedWorkloadSpec['workload']['type'] {
  if (nodes.some((node) => node.classification?.serviceCategory === 'ai')) {
    return 'ml_workload';
  }

  if (nodes.some((node) => node.classification?.serviceCategory === 'analytics')) {
    return 'data_pipeline';
  }

  if (nodes.some((node) => node.classification?.serviceType.includes('serverless-function'))) {
    return 'api_backend';
  }

  return 'web_app';
}

function diagramWorkloadName(fileName: string | undefined): string | undefined {
  if (!fileName) {
    return undefined;
  }

  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .slice(0, 80);
}

function roleFromLabel(label: string, index: number, fallback: string): string {
  const cleaned = label
    .replace(/\b(aws|azure|gcp|amazon|google|cloud)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned ? cleaned.slice(0, 40) : `${fallback}-${index + 1}`;
}

function storageSizeGbFromLabel(label: string): number | undefined {
  const matchedSize = firstNumberWithUnit(label, ['gb', 'tb']);

  if (!matchedSize) {
    return undefined;
  }

  return matchedSize.unit === 'tb' ? matchedSize.value * 1024 : matchedSize.value;
}

function regionPreferenceFromNodes(nodes: ClassifiedDiagramNode[]): string | undefined {
  const regionPatterns = [
    /\b(us|eu|ap|sa|ca|me|af)-(?:north|south|east|west|central|northeast|southeast|southwest|northwest)-\d\b/i,
    /\b[a-z]+(?:us|eu|asia|india|japan|korea|australia|brazil|canada|uk|france|germany|switzerland|norway|sweden|poland|spain|italy|uae|israel|qatar|southafrica)\d?\b/i,
    /\b(?:eastus|westus|centralus|westeurope|northeurope|uksouth|ukwest|japaneast|japanwest)\b/i,
  ];

  for (const node of nodes) {
    for (const pattern of regionPatterns) {
      const match = node.displayLabel.match(pattern);
      if (match?.[0]) {
        return match[0].toLowerCase();
      }
    }
  }

  return undefined;
}

function firstNumberForUnits(label: string, units: string[]): number | undefined {
  return firstNumberWithUnit(label, units)?.value;
}

function firstNumberWithUnit(
  label: string,
  units: string[],
): { value: number; unit: string } | undefined {
  const allowedUnits = new Set(units.map((unit) => unit.toLowerCase()));
  const tokens = tokenizeForUnitParsing(label);

  for (let index = 0; index < tokens.length; index += 1) {
    const parsed = parseNumberPrefix(tokens.at(index) ?? '');

    if (!parsed) {
      continue;
    }

    const currentUnit = normalizeUnit(parsed.suffix);
    if (currentUnit && allowedUnits.has(currentUnit)) {
      return {
        value: parsed.value,
        unit: currentUnit,
      };
    }

    const nextUnit = normalizeUnit(tokens.at(index + 1) ?? '');
    if (nextUnit && allowedUnits.has(nextUnit)) {
      return {
        value: parsed.value,
        unit: nextUnit,
      };
    }
  }

  return undefined;
}

function tokenizeForUnitParsing(label: string): string[] {
  return label
    .toLowerCase()
    .replace(/[(),;:/]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function parseNumberPrefix(token: string): { value: number; suffix: string } | undefined {
  let endIndex = 0;
  let dotCount = 0;

  while (endIndex < token.length) {
    const char = token.charAt(endIndex);

    if (char >= '0' && char <= '9') {
      endIndex += 1;
      continue;
    }

    if (char === '.' && dotCount === 0) {
      dotCount += 1;
      endIndex += 1;
      continue;
    }

    break;
  }

  if (endIndex === 0) {
    return undefined;
  }

  const value = Number.parseFloat(token.slice(0, endIndex));
  if (!Number.isFinite(value)) {
    return undefined;
  }

  return {
    value,
    suffix: token.slice(endIndex),
  };
}

function normalizeUnit(unit: string): string | undefined {
  const normalized = unit.trim().toLowerCase();

  if (!normalized) {
    return undefined;
  }

  return normalized.endsWith('s') ? normalized.slice(0, -1) : normalized;
}

function quantityFromServiceRequirement(node: ClassifiedDiagramNode): number | undefined {
  return node.classification?.serviceRequirement.quantity;
}

function databaseEngineFromLabel(
  label: string,
): NormalizedWorkloadSpec['database'][number]['engine'] {
  if (/postgres|postgresql/i.test(label)) {
    return 'postgres';
  }

  if (/mysql/i.test(label)) {
    return 'mysql';
  }

  if (/sql server|mssql/i.test(label)) {
    return 'sql_server';
  }

  if (/mongo/i.test(label)) {
    return 'mongodb';
  }

  if (/redis|cache/i.test(label)) {
    return 'redis';
  }

  if (/dynamodb|cosmos|firestore|nosql/i.test(label)) {
    return 'generic_nosql';
  }

  return 'generic_relational';
}

export function normalizedRequirementsFromDiagramNws(nws: NormalizedWorkloadSpec) {
  return normalizedRequirementsFromNws(nws, 'drawio_diagram');
}
