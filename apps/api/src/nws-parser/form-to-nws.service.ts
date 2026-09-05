import { Injectable } from '@nestjs/common';
import { NWSValidator } from '../nws/nws-validator.js';
import { NormalizedWorkloadSpec } from '../nws/nws.types.js';
import { StructuredWorkloadFormInput } from './nws-parser.types.js';

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
        ...(isNumber(formInput.network?.crossAzTransferGb)
          ? { crossAzTransferGb: formInput.network.crossAzTransferGb }
          : {}),
        ...(isNumber(formInput.network?.interRegionTransferGb)
          ? { interRegionTransferGb: formInput.network.interRegionTransferGb }
          : {}),
        ...(isNumber(formInput.network?.cdnTrafficGb)
          ? { cdnTrafficGb: formInput.network.cdnTrafficGb }
          : {}),
        ...(isNumber(formInput.network?.cdnCacheHitRatioPercent)
          ? { cdnCacheHitRatioPercent: formInput.network.cdnCacheHitRatioPercent }
          : {}),
        ...(isNumber(formInput.network?.cdnRequestsMillion)
          ? { cdnRequestsMillion: formInput.network.cdnRequestsMillion }
          : {}),
        ...(isNumber(formInput.network?.natGatewayGb)
          ? { natGatewayGb: formInput.network.natGatewayGb }
          : {}),
        ...(isNumber(formInput.network?.natGatewayHours)
          ? { natGatewayHours: formInput.network.natGatewayHours }
          : {}),
        ...(isNumber(formInput.network?.dnsHostedZones)
          ? { dnsHostedZones: formInput.network.dnsHostedZones }
          : {}),
        ...(isNumber(formInput.network?.dnsQueriesMillion)
          ? { dnsQueriesMillion: formInput.network.dnsQueriesMillion }
          : {}),
        ...(isNumber(formInput.network?.loadBalancerProcessedGb)
          ? { loadBalancerProcessedGb: formInput.network.loadBalancerProcessedGb }
          : {}),
        ...(isNumber(formInput.network?.loadBalancerHours)
          ? { loadBalancerHours: formInput.network.loadBalancerHours }
          : {}),
        ...(isNumber(formInput.network?.loadBalancerNewConnectionsPerSecond)
          ? {
              loadBalancerNewConnectionsPerSecond:
                formInput.network.loadBalancerNewConnectionsPerSecond,
            }
          : {}),
        ...(isNumber(formInput.network?.loadBalancerActiveConnections)
          ? { loadBalancerActiveConnections: formInput.network.loadBalancerActiveConnections }
          : {}),
        ...(isNumber(formInput.network?.loadBalancerRuleEvaluationsPerSecond)
          ? {
              loadBalancerRuleEvaluationsPerSecond:
                formInput.network.loadBalancerRuleEvaluationsPerSecond,
            }
          : {}),
        ...(isNumber(formInput.network?.vpnConnectionCount)
          ? { vpnConnectionCount: formInput.network.vpnConnectionCount }
          : {}),
        ...(isNumber(formInput.network?.vpnConnectionHours)
          ? { vpnConnectionHours: formInput.network.vpnConnectionHours }
          : {}),
        ...(isNumber(formInput.network?.vpnDataTransferGb)
          ? { vpnDataTransferGb: formInput.network.vpnDataTransferGb }
          : {}),
        ...(isNumber(formInput.network?.privateCircuitCount)
          ? { privateCircuitCount: formInput.network.privateCircuitCount }
          : {}),
        ...(isNumber(formInput.network?.privateCircuitPortHours)
          ? { privateCircuitPortHours: formInput.network.privateCircuitPortHours }
          : {}),
        ...(isNumber(formInput.network?.privateCircuitDataTransferGb)
          ? { privateCircuitDataTransferGb: formInput.network.privateCircuitDataTransferGb }
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
