import { randomUUID } from 'node:crypto';
import { Injectable, Optional } from '@nestjs/common';
import { DomainMetricsService } from '../observability/domain-metrics.service';
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
  DIAGRAM_LLM_MAX_NODES_PER_PARSE,
  DIAGRAM_MAX_NODES,
  DiagramParseRequest,
  DiagramParseResult,
  DiagramReviewComponent,
  DiagramVisualPreview,
  ExtractedDiagram,
  ExtractedDiagramNode,
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
    @Optional() private readonly domainMetrics?: DomainMetricsService,
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

    // detectedFormat and parserConfidence are both closed unions (4 x 3), so
    // this is 12 series at most. The file name and sha256 on `decoded` are
    // deliberately not labels.
    this.domainMetrics?.recordDiagramParse({
      format: decoded.detectedFormat,
      confidence: parserConfidence,
      unresolvedCount: review.unresolvedClassifications.length,
      ignoredCount: review.ignoredNodes.length,
    });

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
    const extractionWarnings = extracted.extractionWarnings ?? [];
    const graphNodes: DiagramGraphNode[] = [];
    const classifiedNodes: ClassifiedDiagramNode[] = [];
    const unresolvedClassifications: DiagramIgnoredNode[] = [...extractionWarnings];
    const ignoredNodes: DiagramIgnoredNode[] = [];
    const reviewComponents: DiagramReviewComponent[] = [];
    const assumedDefaults: string[] = [];
    const fieldsRequiringReview: string[] = extractionWarnings.map(
      (warning) => `diagram.extraction.${warning.id}`,
    );
    const nodesToParse = extracted.nodes.slice(0, DIAGRAM_MAX_NODES);
    const localClassifications = new Map<
      string,
      Awaited<ReturnType<NodeClassifierService['classify']>>
    >();
    const unresolvedNodesNeedingLlm: ExtractedDiagramNode[] = [];

    for (const node of nodesToParse) {
      const localClassification = this.nodeClassifierService.classifyLocal(node);

      if (localClassification) {
        localClassifications.set(node.id, localClassification);
      } else {
        unresolvedNodesNeedingLlm.push(node);
      }
    }

    const llmClassifications = await this.nodeClassifierService.classifyUnresolvedBatch(
      unresolvedNodesNeedingLlm,
      {
        maxLlmNodes: DIAGRAM_LLM_MAX_NODES_PER_PARSE,
        llmSkippedReason: `Tier 3 LLM classifier cost guard skipped after ${DIAGRAM_LLM_MAX_NODES_PER_PARSE} unresolved nodes`,
      },
    );

    for (const node of nodesToParse) {
      const displayLabel = sanitizeDisplayText(node.rawLabel, node.id);
      const classification = localClassifications.get(node.id) ?? llmClassifications.get(node.id);

      if (!classification) {
        continue;
      }

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
          evidence: classificationEvidence(classification.reason, node),
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
        ...visualPreviewsForGraph(extracted.format, graphNodes, extracted.edges),
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

const MAX_VISUAL_PREVIEW_PAGES = 3;
const MAX_VISUAL_PREVIEW_NODES_PER_PAGE = 60;
const SVG_PREVIEW_PADDING = 0.35;

function visualPreviewsForGraph(
  format: ExtractedDiagram['format'],
  nodes: DiagramGraphNode[],
  edges: ExtractedDiagram['edges'],
): { visualPreviews: DiagramVisualPreview[] } | Record<string, never> {
  if (format !== 'vsdx') {
    return {};
  }

  const nodesByPage = new Map<string, DiagramGraphNode[]>();

  for (const node of nodes) {
    if (!node.bounds || !node.visual?.pageRef) {
      continue;
    }

    const pageNodes = nodesByPage.get(node.visual.pageRef) ?? [];
    pageNodes.push(node);
    nodesByPage.set(node.visual.pageRef, pageNodes);
  }

  const visualPreviews = [...nodesByPage.entries()]
    .slice(0, MAX_VISUAL_PREVIEW_PAGES)
    .map(([pageRef, pageNodes]) => visualPreviewForPage(pageRef, pageNodes, edges))
    .filter((preview): preview is DiagramVisualPreview => Boolean(preview));

  return visualPreviews.length > 0 ? { visualPreviews } : {};
}

function visualPreviewForPage(
  pageRef: string,
  pageNodes: DiagramGraphNode[],
  edges: ExtractedDiagram['edges'],
): DiagramVisualPreview | undefined {
  const boundedNodes = pageNodes
    .filter((node) => node.bounds)
    .slice(0, MAX_VISUAL_PREVIEW_NODES_PER_PAGE);

  if (boundedNodes.length === 0) {
    return undefined;
  }

  const pageWidth =
    firstFiniteNumber(boundedNodes.map((node) => node.visual?.pageWidth)) ??
    Math.max(...boundedNodes.map((node) => node.bounds!.x + node.bounds!.width));
  const pageHeight =
    firstFiniteNumber(boundedNodes.map((node) => node.visual?.pageHeight)) ??
    Math.max(...boundedNodes.map((node) => node.bounds!.y + node.bounds!.height));
  const viewBoxWidth = roundPreview(pageWidth + SVG_PREVIEW_PADDING * 2);
  const viewBoxHeight = roundPreview(pageHeight + SVG_PREVIEW_PADDING * 2);
  const nodeCenters = new Map(
    boundedNodes.map((node) => [
      node.id,
      {
        x: roundPreview(node.bounds!.x + node.bounds!.width / 2 + SVG_PREVIEW_PADDING),
        y: roundPreview(
          pageHeight - node.bounds!.y - node.bounds!.height / 2 + SVG_PREVIEW_PADDING,
        ),
      },
    ]),
  );
  const samePageEdges = edges
    .map((edge) => {
      const source = nodeCenters.get(edge.sourceId);
      const target = nodeCenters.get(edge.targetId);

      return source && target
        ? {
            edge,
            source,
            target,
          }
        : undefined;
    })
    .filter(
      (
        edge,
      ): edge is {
        edge: ExtractedDiagram['edges'][number];
        source: { x: number; y: number };
        target: { x: number; y: number };
      } => Boolean(edge),
    );
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeSvgAttribute(
      `Approximate VSDX preview for ${pageNodes[0]?.visual?.pageName ?? pageRef}`,
    )}" viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}">`,
    '<rect x="0" y="0" width="100%" height="100%" rx="0.16" fill="white"/>',
    `<g stroke="gainsboro" stroke-width="0.015">${gridLines(viewBoxWidth, viewBoxHeight).join('')}</g>`,
    ...samePageEdges.map(
      ({ edge, source, target }) =>
        `<line data-edge-id="${escapeSvgAttribute(edge.id)}" x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}" stroke="steelblue" stroke-width="0.04" stroke-linecap="round"/>`,
    ),
    ...boundedNodes.map((node) => svgNode(node, pageHeight)),
    '</svg>',
  ].join('');
  const warnings = [
    'approximate SVG preview from VSDX geometry, not full Visio visual rendering',
    'does not evaluate Visio themes, formulas, icons, embedded media, or text wrapping',
  ];

  if (pageNodes.length > boundedNodes.length) {
    warnings.push(
      `preview capped at ${MAX_VISUAL_PREVIEW_NODES_PER_PAGE} positioned nodes on this page`,
    );
  }

  return {
    format: 'svg',
    renderingMode: 'approximate-vsdx-svg',
    pageRef,
    pageName: pageNodes[0]?.visual?.pageName ?? pageRef,
    width: viewBoxWidth,
    height: viewBoxHeight,
    nodeCount: boundedNodes.length,
    edgeCount: samePageEdges.length,
    svg,
    warnings,
  };
}

function svgNode(node: DiagramGraphNode, pageHeight: number): string {
  const bounds = node.bounds!;
  const x = roundPreview(bounds.x + SVG_PREVIEW_PADDING);
  const y = roundPreview(pageHeight - bounds.y - bounds.height + SVG_PREVIEW_PADDING);
  const width = roundPreview(bounds.width);
  const height = roundPreview(bounds.height);
  const fill = safeSvgColor(node.visual?.fillColor) ?? 'white';
  const stroke = safeSvgColor(node.visual?.lineColor) ?? strokeForNodeKind(node.kind);
  const label = ellipsizeSvgText(node.displayLabel, 44);
  const fontSize = Math.max(0.12, Math.min(0.24, height / 5));
  const textY = roundPreview(y + height / 2 + fontSize / 3);

  return [
    `<g data-node-id="${escapeSvgAttribute(node.id)}">`,
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="0.08" fill="${fill}" fill-opacity="0.16" stroke="${stroke}" stroke-width="0.035"/>`,
    `<text x="${roundPreview(x + width / 2)}" y="${textY}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${roundPreview(
      fontSize,
    )}" font-weight="700" fill="black">${escapeSvgText(label)}</text>`,
    '</g>',
  ].join('');
}

function gridLines(width: number, height: number): string[] {
  const lines: string[] = [];
  const step = Math.max(1, Math.round(Math.min(width, height) / 8));

  for (let x = step; x < width; x += step) {
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}"/>`);
  }

  for (let y = step; y < height; y += step) {
    lines.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}"/>`);
  }

  return lines;
}

function firstFiniteNumber(values: Array<number | undefined>): number | undefined {
  return values.find(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );
}

function safeSvgColor(value: string | undefined): string | undefined {
  return value && /^#[0-9A-F]{6}$/i.test(value) ? value : undefined;
}

function strokeForNodeKind(kind: DiagramGraphNode['kind']): string {
  switch (kind) {
    case 'resource':
      return 'seagreen';
    case 'unknown':
      return 'darkorange';
    case 'decorative':
      return 'slategray';
    case 'connector':
      return 'steelblue';
    default:
      return 'slategray';
  }
}

function ellipsizeSvgText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function escapeSvgText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeSvgAttribute(value: string): string {
  return escapeSvgText(value).replace(/"/g, '&quot;');
}

function roundPreview(value: number): number {
  return Math.round(value * 1000) / 1000;
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

function classificationEvidence(reason: string, node: ExtractedDiagramNode): string {
  const visual = node.visual;

  if (!visual) {
    return reason;
  }

  const visualEvidence = [
    visual.pageName ? `Visio page ${sanitizeDisplayText(visual.pageName, 'page')}` : undefined,
    visual.pageWidth && visual.pageHeight
      ? `Visio page size w=${visual.pageWidth} h=${visual.pageHeight}`
      : undefined,
    visual.masterName
      ? `Visio master ${sanitizeDisplayText(visual.masterName, 'master')}`
      : undefined,
    visual.containerId
      ? [
          `container ${sanitizeDisplayText(visual.containerId, 'container')}`,
          visual.containerLabel
            ? `(${sanitizeDisplayText(visual.containerLabel, 'container')})`
            : undefined,
        ]
          .filter((value): value is string => Boolean(value))
          .join(' ')
      : undefined,
    node.bounds
      ? `Visio bounds x=${node.bounds.x} y=${node.bounds.y} w=${node.bounds.width} h=${node.bounds.height}`
      : undefined,
    visual.normalizedBounds
      ? `Visio preview box x=${visual.normalizedBounds.x}% y=${visual.normalizedBounds.y}% w=${visual.normalizedBounds.width}% h=${visual.normalizedBounds.height}%`
      : undefined,
    visual.geometryHint ? `Visio geometry ${visual.geometryHint}` : undefined,
    visual.fillColor || visual.lineColor
      ? [
          'Visio style',
          visual.fillColor ? `fill ${visual.fillColor}` : undefined,
          visual.lineColor ? `line ${visual.lineColor}` : undefined,
        ]
          .filter((value): value is string => Boolean(value))
          .join(' ')
      : undefined,
    visual.renderingMode
      ? `Visio rendering ${visual.renderingMode}; ${
          visual.renderingWarnings?.[0] ?? 'not full Visio visual rendering'
        }`
      : undefined,
  ].filter((value): value is string => Boolean(value));

  return visualEvidence.length > 0 ? `${reason}; ${visualEvidence.join('; ')}` : reason;
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
    const searchableLabels = [
      node.displayLabel,
      node.visual?.containerLabel,
      node.visual?.pageName,
      node.visual?.masterName,
    ].filter((value): value is string => Boolean(value));

    for (const pattern of regionPatterns) {
      for (const label of searchableLabels) {
        const match = label.match(pattern);
        if (match?.[0]) {
          return match[0].toLowerCase();
        }
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
