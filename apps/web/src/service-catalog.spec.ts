import { CLOUD_SERVICE_CATALOG, supportLabel } from './service-catalog';

describe('service catalog coverage labels', () => {
  it('marks production-depth modeled service families as priced', () => {
    const pricedFamilyIds = [
      'serverless-functions',
      'container-orchestration',
      'serverless-containers',
      'container-registry',
      'app-platform',
      'api-gateway',
      'nosql-database',
      'managed-search',
      'data-warehouse',
      'data-lake',
      'data-integration',
      'streaming-analytics',
      'business-intelligence',
      'queues-messaging',
      'eventing',
      'workflow-orchestration',
      'keys-secrets',
      'security-posture',
      'waf-ddos',
      'monitoring',
      'logging-audit',
      'tracing-apm',
    ];

    const catalogById = new Map(CLOUD_SERVICE_CATALOG.map((family) => [family.id, family]));

    expect(pricedFamilyIds.map((id) => [id, catalogById.get(id)?.supportStatus])).toEqual(
      pricedFamilyIds.map((id) => [id, 'priced']),
    );
    expect(supportLabel('priced')).toBe('Priced');
  });
});
