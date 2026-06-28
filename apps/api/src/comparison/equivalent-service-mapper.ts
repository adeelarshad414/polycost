import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  ProviderId,
  ProviderPricingLineItem,
  ServiceCategory,
} from '../adapters/common/cloud-provider-adapter';
import {
  ComputeComponent,
  DatabaseComponent,
  NormalizedWorkloadSpec,
  StorageComponent,
} from '../nws/nws.types';
import {
  ProviderSkuPatterns,
  SERVICE_EQUIVALENCE_SEED,
  ServiceEquivalenceRule,
} from './service-equivalence.seed';
import { SERVICE_EQUIVALENCE_RULES } from './comparison.tokens';

export interface EquivalentServiceMapping {
  category: ServiceCategory;
  tierLabel: string;
  sourcePath: string;
  providerSkuPatterns: ProviderSkuPatterns;
  notes: string;
  isApproximate: boolean;
}

@Injectable()
export class EquivalentServiceMapper {
  private readonly rules: ServiceEquivalenceRule[];

  constructor(
    @Optional()
    @Inject(SERVICE_EQUIVALENCE_RULES)
    rules?: ServiceEquivalenceRule[],
  ) {
    this.rules = rules ?? SERVICE_EQUIVALENCE_SEED;
  }

  mapWorkload(nws: NormalizedWorkloadSpec): EquivalentServiceMapping[] {
    const mappings: EquivalentServiceMapping[] = [];

    nws.compute.forEach((component, index) => {
      mappings.push(
        this.toMapping('compute', this.computeTierLabel(component), `compute.${index}`),
      );
    });

    nws.storage.forEach((component, index) => {
      mappings.push(
        this.toMapping('storage', this.storageTierLabel(component), `storage.${index}`),
      );
    });

    nws.database.forEach((component, index) => {
      mappings.push(
        this.toMapping('database', this.databaseTierLabel(component), `database.${index}`),
      );
    });

    if (nws.network.estimatedMonthlyEgressGb && nws.network.estimatedMonthlyEgressGb > 0) {
      mappings.push(
        this.toMapping('network', 'network-egress-internet', 'network.estimatedMonthlyEgressGb'),
      );
    }

    if (nws.network.cdn) {
      mappings.push(this.toMapping('network', 'network-cdn', 'network.cdn'));
    }

    if (nws.network.loadBalancer) {
      mappings.push(this.toMapping('network', 'network-load-balancer', 'network.loadBalancer'));
    }

    return mappings;
  }

  annotateLineItem(
    nws: NormalizedWorkloadSpec,
    providerId: ProviderId,
    lineItem: ProviderPricingLineItem,
  ): ProviderPricingLineItem {
    return {
      ...lineItem,
      isApproximate:
        lineItem.isApproximate || this.isApproximateForProvider(nws, providerId, lineItem.category),
    };
  }

  isApproximateForProvider(
    nws: NormalizedWorkloadSpec,
    providerId: ProviderId,
    category: ServiceCategory,
  ): boolean {
    if (this.hasProviderSpecificPreferenceForAnotherCloud(nws, providerId, category)) {
      return true;
    }

    return this.mapWorkload(nws).some(
      (mapping) => mapping.category === category && mapping.isApproximate,
    );
  }

  private toMapping(
    category: ServiceCategory,
    tierLabel: string,
    sourcePath: string,
  ): EquivalentServiceMapping {
    const rule = this.findRule(category, tierLabel) ?? {
      category,
      tierLabel,
      notes: 'No reviewed equivalence rule exists for this workload tier yet.',
      isApproximate: true,
    };

    return {
      category,
      tierLabel,
      sourcePath,
      providerSkuPatterns: this.providerSkuPatterns(rule),
      notes: rule.notes,
      isApproximate: rule.isApproximate,
    };
  }

  private computeTierLabel(component: ComputeComponent): string {
    if (component.scalingType === 'autoscaling') {
      return 'compute-autoscaling-general-purpose';
    }

    return 'compute-fixed-general-purpose';
  }

  private storageTierLabel(component: StorageComponent): string {
    if (component.type === 'block') {
      return 'storage-block-general-purpose';
    }

    if (component.type === 'file') {
      return 'storage-file-shared';
    }

    if (component.accessPattern === 'archive') {
      return 'storage-object-archive';
    }

    if (component.accessPattern === 'infrequent') {
      return 'storage-object-infrequent';
    }

    return 'storage-object-standard';
  }

  private databaseTierLabel(component: DatabaseComponent): string {
    if (component.engine === 'postgres') {
      return 'database-postgres-managed';
    }

    if (component.engine === 'mysql') {
      return 'database-mysql-managed';
    }

    if (component.engine === 'mongodb') {
      return 'database-mongodb-managed';
    }

    if (component.engine === 'redis') {
      return 'database-redis-managed';
    }

    if (component.engine === 'generic_relational') {
      return 'database-generic-relational-managed';
    }

    return 'database-generic-nosql-managed';
  }

  private findRule(
    category: ServiceCategory,
    tierLabel: string,
  ): ServiceEquivalenceRule | undefined {
    return this.rules.find((rule) => rule.category === category && rule.tierLabel === tierLabel);
  }

  private providerSkuPatterns(rule: ServiceEquivalenceRule): ProviderSkuPatterns {
    return {
      aws: rule.awsSkuPattern,
      azure: rule.azureSkuPattern,
      gcp: rule.gcpSkuPattern,
    };
  }

  private hasProviderSpecificPreferenceForAnotherCloud(
    nws: NormalizedWorkloadSpec,
    providerId: ProviderId,
    category: ServiceCategory,
  ): boolean {
    if (category !== 'database') {
      return false;
    }

    return nws.database.some((component) => {
      const preferredProvider = this.inferProviderFromPreference(
        component.managedServicePreference,
      );

      return preferredProvider !== undefined && preferredProvider !== providerId;
    });
  }

  private inferProviderFromPreference(preference?: string): ProviderId | undefined {
    if (!preference) {
      return undefined;
    }

    const normalized = preference.toLowerCase();

    if (
      ['aws', 'aurora', 'rds', 'dynamodb', 'documentdb', 'elasticache', 'redshift'].some((term) =>
        normalized.includes(term),
      )
    ) {
      return 'aws';
    }

    if (
      ['azure', 'cosmos db', 'azure database', 'azure cache', 'synapse'].some((term) =>
        normalized.includes(term),
      )
    ) {
      return 'azure';
    }

    if (
      ['gcp', 'google cloud', 'cloud sql', 'cloud spanner', 'firestore', 'memorystore'].some(
        (term) => normalized.includes(term),
      )
    ) {
      return 'gcp';
    }

    return undefined;
  }
}
