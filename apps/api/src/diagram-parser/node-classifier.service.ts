import { Injectable } from '@nestjs/common';
import { NormalizedRequirementCategory } from '@polycost/types';
import { HOURS_PER_MONTH } from '../cost-time';
import { ServiceRequirement } from '../nws/nws.types';
import { AliasDictionary, AliasMatch } from './alias-dictionary';
import {
  DiagramIgnoredNode,
  DiagramNodeClassification,
  ExtractedDiagramNode,
  LlmClassifierClient,
} from './diagram-parser.types';
import { sanitizeDisplayText } from './diagram-security';
import { StubLlmClassifierClient } from './llm-classifier.client';
import { StencilMapRegistry } from './stencil-map.registry';

@Injectable()
export class NodeClassifierService {
  constructor(
    private readonly stencilMapRegistry: StencilMapRegistry,
    private readonly aliasDictionary: AliasDictionary,
    private readonly llmClassifierClient: LlmClassifierClient = new StubLlmClassifierClient(),
  ) {}

  async classify(
    node: ExtractedDiagramNode,
  ): Promise<DiagramNodeClassification | DiagramIgnoredNode> {
    const displayLabel = sanitizeDisplayText(node.rawLabel, node.id);

    if (isDecorativeNode(displayLabel, node.style)) {
      return {
        id: node.id,
        displayLabel,
        reason: 'decorative or grouping shape',
        sourceRef: node.sourceRef,
      };
    }

    const stencilMatch = this.stencilMapRegistry.match(node.stencilId ?? node.style);
    if (stencilMatch) {
      return classificationFromMatch(stencilMatch, displayLabel, 'high', 'stencil match', node.id);
    }

    const labelMatch = this.aliasDictionary.match(displayLabel);
    if (labelMatch) {
      return classificationFromMatch(labelMatch, displayLabel, 'moderate', 'label alias', node.id);
    }

    const llmMatch = await this.llmClassifierClient.classify({
      displayLabel,
      stencilId: node.stencilId,
    });

    if (llmMatch) {
      return llmMatch;
    }

    return {
      id: node.id,
      displayLabel,
      reason: 'no service alias matched; classify before pricing',
      sourceRef: node.sourceRef,
    };
  }
}

function classificationFromMatch(
  match: AliasMatch,
  label: string,
  confidence: DiagramNodeClassification['confidence'],
  reason: string,
  diagramNodeId: string,
): DiagramNodeClassification {
  const assumedDefaults = assumptionsFor(match.serviceCategory, match.serviceType, label);

  return {
    serviceCategory: match.serviceCategory,
    serviceType: match.serviceType,
    confidence,
    reason,
    assumedDefaults,
    serviceRequirement: serviceRequirementFor(
      match.serviceCategory,
      match.serviceType,
      label,
      {
        confidence,
        reason,
        assumedDefaultCount: assumedDefaults.length,
      },
      diagramNodeId,
    ),
  };
}

function serviceRequirementFor(
  serviceCategory: NormalizedRequirementCategory,
  serviceType: string,
  label: string,
  scaleParams: Record<string, string | number | boolean>,
  diagramNodeId: string,
): ServiceRequirement {
  return {
    serviceCategory,
    serviceType,
    quantity: quantityFromLabel(label),
    scaleParams: {
      ...scaleParams,
      diagramNodeId,
    },
  };
}

function assumptionsFor(
  serviceCategory: NormalizedRequirementCategory,
  serviceType: string,
  label: string,
): string[] {
  const assumptions: string[] = [];

  if (serviceCategory === 'compute' || serviceCategory === 'containers') {
    assumptions.push('general-purpose compute family');
    if (!/\b\d+\s*(vcpu|cpu|core)/i.test(label)) {
      assumptions.push('2 vCPU');
    }
    if (!/\b\d+\s*gb\b/i.test(label)) {
      assumptions.push('8 GB memory');
    }
  }

  if (serviceCategory === 'storage' && !/\b\d+\s*(gb|tb)\b/i.test(label)) {
    assumptions.push('100 GB storage');
  }

  if (serviceCategory === 'database' && !/\b\d+\s*(gb|tb)\b/i.test(label)) {
    assumptions.push('100 GB database storage');
  }

  if (serviceType === 'load-balancer') {
    assumptions.push(`${HOURS_PER_MONTH} load-balancer hours per month`);
  }

  if (serviceType === 'cdn') {
    assumptions.push('CDN enabled with 85% cache hit ratio');
  }

  return assumptions;
}

function quantityFromLabel(label: string): number {
  const countMatch =
    label.match(/\b(?:x|×)\s*([2-9]|[1-9]\d+)\b/i) ??
    label.match(/\b([2-9]|[1-9]\d+)\s*(?:x|×|instances?|nodes?|servers?)\b/i);

  return countMatch ? Number.parseInt(countMatch[1], 10) : 1;
}

function isDecorativeNode(label: string, style: string | undefined): boolean {
  const compactLabel = label.trim().toLowerCase();
  const compactStyle = style?.toLowerCase() ?? '';

  return (
    compactLabel.length === 0 ||
    /^(group|note|legend|title|boundary|zone|region|subnet|vpc|vnet|project)$/i.test(
      compactLabel,
    ) ||
    compactStyle.includes('swimlane') ||
    compactStyle.includes('text;') ||
    compactStyle.includes('shape=note')
  );
}
