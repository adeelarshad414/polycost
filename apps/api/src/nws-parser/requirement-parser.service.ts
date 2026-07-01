import { Injectable } from '@nestjs/common';
import type {
  NormalizedRequirement,
  RequirementInputSource,
  RequirementParserService,
} from '@polycost/types';
import { NormalizedWorkloadSpec, ServiceRequirement } from '../nws/nws.types';
import { FormToNWSService } from './form-to-nws.service';
import { NLParserService } from './nl-parser.service';
import { StructuredWorkloadFormInput } from './nws-parser.types';

export const REQUIREMENT_PARSERS = Symbol('REQUIREMENT_PARSERS');

export interface ParsedRequirementSet {
  requirements: NormalizedRequirement[];
  nws: NormalizedWorkloadSpec;
}

export interface NwsBackedRequirementParser<
  Input = unknown,
> extends RequirementParserService<Input> {
  parseToNws(input: Input): Promise<ParsedRequirementSet> | ParsedRequirementSet;
}

@Injectable()
export class NaturalLanguageRequirementParser implements NwsBackedRequirementParser<string> {
  constructor(private readonly nlParserService: NLParserService) {}

  async parse(input: string): Promise<NormalizedRequirement[]> {
    return (await this.parseToNws(input)).requirements;
  }

  async parseToNws(input: string): Promise<ParsedRequirementSet> {
    const parsed = await this.nlParserService.parse(input);

    return {
      nws: parsed.draftNws,
      requirements: normalizedRequirementsFromNws(parsed.draftNws, 'natural_language'),
    };
  }
}

@Injectable()
export class GuidedFormRequirementParser implements NwsBackedRequirementParser<StructuredWorkloadFormInput> {
  constructor(private readonly formToNwsService: FormToNWSService) {}

  parse(input: StructuredWorkloadFormInput): NormalizedRequirement[] {
    return this.parseToNws(input).requirements;
  }

  parseToNws(input: StructuredWorkloadFormInput): ParsedRequirementSet {
    const nws = this.formToNwsService.parse(input);

    return {
      nws,
      requirements: normalizedRequirementsFromNws(nws, 'guided_form'),
    };
  }
}

// PHASE_2_HOOK: CSV, Excel, and DrawIO parsers should implement NwsBackedRequirementParser here.
// PHASE_3_HOOK: Terraform import can implement this parser contract to feed the same NWS pipeline.
export function normalizedRequirementsFromNws(
  nws: NormalizedWorkloadSpec,
  source: RequirementInputSource,
): NormalizedRequirement[] {
  const serviceRequirements = nws.serviceRequirements ?? serviceRequirementsFromNws(nws);

  return serviceRequirements.map((requirement, index) =>
    normalizedRequirementFromServiceRequirement(requirement, source, index),
  );
}

function normalizedRequirementFromServiceRequirement(
  requirement: ServiceRequirement,
  source: RequirementInputSource,
  index: number,
): NormalizedRequirement {
  return {
    schemaVersion: '2026-07-01.phase1',
    source,
    requirementId: `req-${index + 1}`,
    serviceCategory: requirement.serviceCategory,
    serviceType: requirement.serviceType,
    config: {
      ...(requirement.instanceType ? { instanceType: requirement.instanceType } : {}),
      ...(requirement.tier ? { tier: requirement.tier } : {}),
    },
    ...(requirement.region ? { region: requirement.region } : {}),
    ...(requirement.az ? { az: requirement.az } : {}),
    quantity: requirement.quantity,
    ...(requirement.scaleParams ? { scaleParams: requirement.scaleParams } : {}),
  };
}

function serviceRequirementsFromNws(nws: NormalizedWorkloadSpec): ServiceRequirement[] {
  const region = nws.workload.region.preference;

  return [
    ...nws.compute.map((compute): ServiceRequirement => ({
      serviceCategory: 'compute',
      serviceType: compute.scalingType === 'autoscaling' ? 'autoscaling-compute' : 'vm-compute',
      ...(compute.vcpu !== undefined || compute.memoryGb !== undefined || compute.instanceFamily
        ? {
            instanceType: `${compute.instanceFamily ?? 'general-purpose'} / ${
              compute.vcpu ?? '?'
            } vCPU / ${compute.memoryGb ?? '?'} GB`,
          }
        : {}),
      ...(region ? { region } : {}),
      az: nws.availability.multiAz ? 'multi-az' : 'single-az',
      quantity: compute.instanceCount ?? compute.autoscalingRange?.min ?? 1,
      scaleParams: {
        role: compute.role,
        ...(compute.instanceFamily ? { instanceFamily: compute.instanceFamily } : {}),
        scalingType: compute.scalingType,
        ...(compute.autoscalingRange
          ? {
              min: compute.autoscalingRange.min,
              max: compute.autoscalingRange.max,
            }
          : {}),
      },
    })),
    ...nws.storage.map((storage): ServiceRequirement => ({
      serviceCategory: 'storage',
      serviceType:
        storage.type === 'block'
          ? 'block-storage'
          : storage.type === 'file'
            ? 'file-storage'
            : storage.accessPattern === 'archive'
              ? 'archive-storage'
              : 'object-storage',
      ...(storage.accessPattern ? { tier: storage.accessPattern } : {}),
      ...(region ? { region } : {}),
      quantity: 1,
      scaleParams: {
        role: storage.role,
        sizeGb: storage.sizeGb,
      },
    })),
    ...nws.database.map((database): ServiceRequirement => ({
      serviceCategory: 'database',
      serviceType: database.engine === 'redis' ? 'cache' : 'relational-database',
      tier: database.highAvailability ? 'high-availability' : 'single-zone',
      ...(region ? { region } : {}),
      az: database.highAvailability ? 'multi-az' : 'single-az',
      quantity: 1,
      scaleParams: {
        role: database.role,
        engine: database.engine,
        ...(database.sizeGb !== undefined ? { sizeGb: database.sizeGb } : {}),
      },
    })),
  ];
}
