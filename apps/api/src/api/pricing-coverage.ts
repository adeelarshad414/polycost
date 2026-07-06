import { ProviderId, ServiceCategory } from '../adapters/common/cloud-provider-adapter';

export type PricingCoverageLevel = 'live_catalog' | 'seeded_catalog' | 'modeled' | 'future_work';
export type PricingTraceLevel = 'sku_price_row' | 'modeled_assumption' | 'not_available';

export interface PricingCoverageCategory {
  category: ServiceCategory;
  coverage: PricingCoverageLevel;
  traceLevel: PricingTraceLevel;
  rateSources: string[];
  limitations: string[];
}

export interface PricingCoverageProvider {
  providerId: ProviderId;
  catalogSource: string;
  credentialRequirement: string;
  liveRefreshMode: string;
  categories: PricingCoverageCategory[];
}

export interface PricingCoverageResponse {
  generatedAt: string;
  coverageVersion: '2026-07-06.phase-2-6';
  estimateGrade: 'decision_grade_estimate';
  invoiceGradeSupported: false;
  invoiceGradeFutureWork: string[];
  providers: PricingCoverageProvider[];
}

const COMMON_MODELED_LIMITATIONS = [
  'Provider private discounts, enterprise agreements, taxes, credits, and committed-spend portfolios are not invoice-modeled.',
  'Spot, reservation, and savings-plan projections are comparison-grade estimates until provider billing exports are integrated.',
];

const SUPPORT_AND_OPERATIONS_LIMITATIONS = [
  'Support and operations line items are modeled from workload posture and public assumptions, not provider billing account commitments.',
];

const AWS_CATEGORIES: PricingCoverageCategory[] = [
  liveCatalog('compute', ['AWS Price List bulk offer files', 'pricing_rates']),
  liveCatalog('storage', ['AWS Price List bulk offer files', 'pricing_catalog']),
  liveCatalog('database', ['AWS Price List bulk offer files', 'pricing_rates']),
  liveCatalog(
    'network',
    ['AWS Price List bulk offer files', 'tiered egress model'],
    [
      'Some AWS networking SKUs require service-specific normalization beyond the MVP-equivalent network model.',
    ],
  ),
  modeled('support', SUPPORT_AND_OPERATIONS_LIMITATIONS),
  modeled('licensing', [
    'BYOL, Hybrid Benefit, dedicated-host density, and OS license portability need user confirmation.',
  ]),
  modeled('operations', SUPPORT_AND_OPERATIONS_LIMITATIONS),
];

const AZURE_CATEGORIES: PricingCoverageCategory[] = [
  liveCatalog('compute', ['Azure Retail Prices API', 'pricing_rates']),
  liveCatalog('storage', ['Azure Retail Prices API', 'pricing_catalog']),
  liveCatalog('database', ['Azure Retail Prices API', 'pricing_rates']),
  liveCatalog(
    'network',
    ['Azure Retail Prices API', 'tiered egress model'],
    [
      'Bandwidth, Front Door, CDN, NAT Gateway, and load-balancer meters need SKU-specific review for invoice-grade output.',
    ],
  ),
  modeled('support', SUPPORT_AND_OPERATIONS_LIMITATIONS),
  modeled('licensing', [
    'Azure Hybrid Benefit, Windows Server, SQL Server, and reservation scope require account-specific validation.',
  ]),
  modeled('operations', SUPPORT_AND_OPERATIONS_LIMITATIONS),
];

const GCP_CATEGORIES: PricingCoverageCategory[] = [
  liveCatalog(
    'compute',
    ['Cloud Billing Catalog API', 'pricing_rates'],
    ['Requires a Vault-backed GCP Cloud Billing access token when mock providers are disabled.'],
  ),
  liveCatalog(
    'storage',
    ['Cloud Billing Catalog API', 'pricing_catalog'],
    ['Requires a Vault-backed GCP Cloud Billing access token when mock providers are disabled.'],
  ),
  liveCatalog(
    'database',
    ['Cloud Billing Catalog API', 'pricing_rates'],
    [
      'Cloud SQL, AlloyDB, Memorystore, and Spanner SKUs need family-specific review for invoice-grade output.',
    ],
  ),
  liveCatalog(
    'network',
    ['Cloud Billing Catalog API', 'tiered egress model'],
    [
      'Interconnect, CDN, Cloud Armor, and cross-region transfer require SKU-specific billing export validation.',
    ],
  ),
  modeled('support', SUPPORT_AND_OPERATIONS_LIMITATIONS),
  modeled('licensing', [
    'Sole-tenant, BYOL, premium images, and committed-use discount scope require account-specific validation.',
  ]),
  modeled('operations', SUPPORT_AND_OPERATIONS_LIMITATIONS),
];

export function pricingCoverageResponse(now: Date = new Date()): PricingCoverageResponse {
  return {
    generatedAt: now.toISOString(),
    coverageVersion: '2026-07-06.phase-2-6',
    estimateGrade: 'decision_grade_estimate',
    invoiceGradeSupported: false,
    invoiceGradeFutureWork: [
      'Provider billing export ingestion for AWS CUR, Azure Cost Management exports, and GCP Billing Export.',
      'Account-specific discounts, credits, taxes, support contracts, and marketplace/private offer terms.',
      'SKU-by-SKU reconciliation between refreshed catalog rows and actual invoice line items.',
      'Regional spot-market history, capacity risk, and commitment portfolio amortization.',
    ],
    providers: [
      {
        providerId: 'aws',
        catalogSource: 'Public AWS Price List bulk offer files',
        credentialRequirement: 'No default credential required for public catalog ETL.',
        liveRefreshMode: 'SKU-scoped bulk-file refresh by service/category/region.',
        categories: AWS_CATEGORIES,
      },
      {
        providerId: 'azure',
        catalogSource: 'Public Azure Retail Prices API',
        credentialRequirement: 'No default credential required for public retail prices.',
        liveRefreshMode: 'Filtered Retail Prices API refresh by service family/category/region.',
        categories: AZURE_CATEGORIES,
      },
      {
        providerId: 'gcp',
        catalogSource: 'Google Cloud Billing Catalog API',
        credentialRequirement:
          'Vault secret/polycost/providers/gcp access_token required when USE_MOCK_PROVIDERS=false.',
        liveRefreshMode: 'Authenticated service/SKU catalog refresh by category/region.',
        categories: GCP_CATEGORIES,
      },
    ],
  };
}

function liveCatalog(
  category: ServiceCategory,
  rateSources: string[],
  limitations: string[] = [],
): PricingCoverageCategory {
  return {
    category,
    coverage: 'live_catalog',
    traceLevel: 'sku_price_row',
    rateSources,
    limitations: [...limitations, ...COMMON_MODELED_LIMITATIONS],
  };
}

function modeled(category: ServiceCategory, limitations: string[]): PricingCoverageCategory {
  return {
    category,
    coverage: 'modeled',
    traceLevel: 'modeled_assumption',
    rateSources: ['modeled_estimate', 'manual_model'],
    limitations: [...limitations, ...COMMON_MODELED_LIMITATIONS],
  };
}
