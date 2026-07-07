import { Body, Controller, Post } from '@nestjs/common';
import { ApiValidationError } from '../api/api-errors';
import { TerraformGenerationService } from './terraform-generation.service';
import {
  TerraformAvailabilityMode,
  TerraformGenerateInput,
  TerraformNetworkTopology,
  TerraformRuntimeTarget,
  TerraformTargetCloud,
} from './terraform.types';

@Controller('api/v1/terraform')
export class TerraformGenerationController {
  constructor(private readonly terraformGenerationService: TerraformGenerationService) {}

  @Post('generate')
  generate(@Body() body: unknown) {
    return this.terraformGenerationService.generate(parseGenerateRequest(body));
  }
}

function parseGenerateRequest(body: unknown): TerraformGenerateInput {
  if (!isRecord(body)) {
    throw new ApiValidationError('Terraform generation request body must be an object');
  }

  if (!('nws' in body)) {
    throw new ApiValidationError('nws is required', [
      {
        field: 'nws',
        issue: 'is required',
      },
    ]);
  }

  return {
    targetCloud: parseTargetCloud(body.targetCloud),
    nws: body.nws,
    ...(typeof body.workspaceName === 'string' && body.workspaceName.trim()
      ? { workspaceName: body.workspaceName }
      : {}),
    ...(typeof body.region === 'string' && body.region.trim() ? { region: body.region } : {}),
    ...(body.options === undefined ? {} : { options: parseGenerateOptions(body.options) }),
  };
}

function parseTargetCloud(value: unknown): TerraformTargetCloud {
  if (value === 'aws' || value === 'azure' || value === 'gcp') {
    return value;
  }

  throw new ApiValidationError('targetCloud must be one of aws, azure, or gcp', [
    {
      field: 'targetCloud',
      issue: 'must be aws, azure, or gcp',
    },
  ]);
}

function parseGenerateOptions(value: unknown): TerraformGenerateInput['options'] {
  if (!isRecord(value)) {
    throw new ApiValidationError('options must be an object when provided', [
      {
        field: 'options',
        issue: 'must be an object',
      },
    ]);
  }

  return {
    ...(value.runtimeTarget === undefined
      ? {}
      : { runtimeTarget: parseRuntimeTarget(value.runtimeTarget) }),
    ...(value.networkTopology === undefined
      ? {}
      : { networkTopology: parseNetworkTopology(value.networkTopology) }),
    ...(value.availabilityMode === undefined
      ? {}
      : { availabilityMode: parseAvailabilityMode(value.availabilityMode) }),
    ...(typeof value.includePolicyPack === 'boolean'
      ? { includePolicyPack: value.includePolicyPack }
      : {}),
    ...(typeof value.includeModuleScaffold === 'boolean'
      ? { includeModuleScaffold: value.includeModuleScaffold }
      : {}),
  };
}

function parseRuntimeTarget(value: unknown): TerraformRuntimeTarget {
  if (
    value === 'vm' ||
    value === 'containers' ||
    value === 'serverless' ||
    value === 'kubernetes'
  ) {
    return value;
  }

  throw new ApiValidationError(
    'options.runtimeTarget must be one of vm, containers, serverless, or kubernetes',
    [
      {
        field: 'options.runtimeTarget',
        issue: 'must be vm, containers, serverless, or kubernetes',
      },
    ],
  );
}

function parseNetworkTopology(value: unknown): TerraformNetworkTopology {
  if (value === 'public' || value === 'private' || value === 'landing-zone') {
    return value;
  }

  throw new ApiValidationError(
    'options.networkTopology must be one of public, private, or landing-zone',
    [
      {
        field: 'options.networkTopology',
        issue: 'must be public, private, or landing-zone',
      },
    ],
  );
}

function parseAvailabilityMode(value: unknown): TerraformAvailabilityMode {
  if (
    value === 'single-region' ||
    value === 'multi-az' ||
    value === 'multi-region-dr' ||
    value === 'active-active'
  ) {
    return value;
  }

  throw new ApiValidationError(
    'options.availabilityMode must be one of single-region, multi-az, multi-region-dr, or active-active',
    [
      {
        field: 'options.availabilityMode',
        issue: 'must be single-region, multi-az, multi-region-dr, or active-active',
      },
    ],
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
