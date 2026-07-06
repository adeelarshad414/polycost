import {
  CLOUD_SERVICE_CATALOG,
  DEFAULT_SELECTED_SERVICE_FAMILY_IDS,
  serviceCatalogTraceability,
  serviceFamilyIdsFromTraceability,
  supportLabel,
} from './service-catalog';

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
    expect(supportLabel('mapped')).toBe('Mapped');
    expect(supportLabel('roadmap')).toBe('Roadmap');
  });

  it('round-trips service catalog traceability and falls back on invalid metadata', () => {
    expect(serviceCatalogTraceability(['load-balancing', 'vm-compute'])).toEqual([
      {
        nwsPath: 'metadata.serviceCatalog',
        sourceRef: 'serviceCatalog:vm-compute',
      },
      {
        nwsPath: 'metadata.serviceCatalog',
        sourceRef: 'serviceCatalog:load-balancing',
      },
    ]);

    expect(
      serviceFamilyIdsFromTraceability([
        { sourceRef: 'serviceCatalog:load-balancing' },
        { sourceRef: 'ignored:database' },
        { sourceRef: 'serviceCatalog:not-a-service' },
        { sourceRef: 'serviceCatalog:vm-compute' },
      ]),
    ).toEqual(['vm-compute', 'load-balancing']);
    expect(serviceFamilyIdsFromTraceability(undefined)).toEqual(
      DEFAULT_SELECTED_SERVICE_FAMILY_IDS,
    );
    expect(serviceFamilyIdsFromTraceability([{ sourceRef: 'not-service-catalog' }])).toEqual(
      DEFAULT_SELECTED_SERVICE_FAMILY_IDS,
    );
  });
});
