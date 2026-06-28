import { Injectable } from '@nestjs/common';
import { NWSValidator } from '../nws/nws-validator';
import { NormalizedWorkloadSpec } from '../nws/nws.types';
import { StructuredWorkloadFormInput } from './nws-parser.types';

@Injectable()
export class FormToNWSService {
  constructor(private readonly now: () => Date = () => new Date()) {}

  parse(formInput: StructuredWorkloadFormInput): NormalizedWorkloadSpec {
    const maybeWorkloadName = cleanString(formInput.workloadName);
    const maybeRegionPreference = cleanString(formInput.regionPreference);
    const maybeSlaTarget = cleanString(formInput.availability?.slaTarget);
    const expectedUsers = buildExpectedUsers(formInput);

    const candidate = {
      schemaVersion: '1.0',
      metadata: {
        sourceType: 'structured_form',
        createdAt: this.now().toISOString(),
      },
      workload: {
        ...(maybeWorkloadName ? { name: maybeWorkloadName } : {}),
        ...(formInput.workloadType ? { type: formInput.workloadType } : {}),
        ...(expectedUsers ? { expectedUsers } : {}),
        region: {
          ...(maybeRegionPreference ? { preference: maybeRegionPreference } : {}),
          isDefault: !maybeRegionPreference,
        },
      },
      compute: formInput.compute ?? [],
      storage: formInput.storage ?? [],
      database: formInput.database ?? [],
      network: {
        ...(isNumber(formInput.network?.estimatedMonthlyEgressGb)
          ? { estimatedMonthlyEgressGb: formInput.network.estimatedMonthlyEgressGb }
          : {}),
        cdn: formInput.network?.cdn ?? false,
        loadBalancer: formInput.network?.loadBalancer ?? false,
      },
      availability: {
        multiAz: formInput.availability?.multiAz ?? false,
        multiRegion: formInput.availability?.multiRegion ?? false,
        ...(maybeSlaTarget ? { slaTarget: maybeSlaTarget } : {}),
      },
    };

    return NWSValidator.validate(candidate);
  }
}

function buildExpectedUsers(
  formInput: StructuredWorkloadFormInput,
): NormalizedWorkloadSpec['workload']['expectedUsers'] | undefined {
  const expectedUsers = {
    ...(isNumber(formInput.dailyActiveUsers)
      ? { dailyActiveUsers: formInput.dailyActiveUsers }
      : {}),
    ...(isNumber(formInput.peakConcurrentUsers)
      ? { peakConcurrentUsers: formInput.peakConcurrentUsers }
      : {}),
  };

  return Object.keys(expectedUsers).length > 0 ? expectedUsers : undefined;
}

function cleanString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
