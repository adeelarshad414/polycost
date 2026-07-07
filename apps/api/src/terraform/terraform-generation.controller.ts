import { Body, Controller, Post } from '@nestjs/common';
import { ApiValidationError } from '../api/api-errors';
import { TerraformGenerationService } from './terraform-generation.service';
import { TerraformGenerateInput, TerraformTargetCloud } from './terraform.types';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
