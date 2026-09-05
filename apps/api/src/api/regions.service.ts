import { Injectable } from '@nestjs/common';
import { ProviderId } from '../adapters/common/cloud-provider-adapter.js';
import {
  CloudRegion,
  CloudRegionProviderCatalog,
  RegionCatalogResponse,
  RegionCatalogSource,
} from './regions.types.js';

const REGION_CACHE_TTL_SECONDS = 12 * 60 * 60;
const FETCH_TIMEOUT_MS = 3_000;

const AWS_REGIONS_URL = 'https://b0.p.awsstatic.com/locations/1.0/aws/current/locations.json';
const AZURE_REGIONS_URL =
  'https://azure.microsoft.com/en-us/explore/global-infrastructure/products-by-region/table';
const GCP_REGIONS_URL = 'https://www.gstatic.com/ipranges/cloud.json';

type FetchLike = typeof fetch;

interface CachedCatalog {
  expiresAt: number;
  response: RegionCatalogResponse;
}

interface RawRegion {
  id: string;
  label: string;
  location?: string;
}

interface GcpIpRangesResponse {
  prefixes?: Array<{
    service?: string;
    scope?: string;
  }>;
}

@Injectable()
export class RegionsService {
  private cachedCatalog?: CachedCatalog;
  private fetchImpl: FetchLike = fetch;

  static withFetch(fetchImpl: FetchLike): RegionsService {
    const service = new RegionsService();
    service.fetchImpl = fetchImpl;

    return service;
  }

  async getRegionCatalog(): Promise<RegionCatalogResponse> {
    const now = Date.now();

    if (this.cachedCatalog && this.cachedCatalog.expiresAt > now) {
      return this.cachedCatalog.response;
    }

    const providers = await Promise.all([
      this.providerCatalog('aws', 'AWS', AWS_REGIONS_URL, () => this.fetchAwsRegions()),
      this.providerCatalog('azure', 'Azure', AZURE_REGIONS_URL, () => this.fetchAzureRegions()),
      this.providerCatalog('gcp', 'Google Cloud', GCP_REGIONS_URL, () => this.fetchGcpRegions()),
    ]);

    const response: RegionCatalogResponse = {
      generatedAt: new Date().toISOString(),
      cacheTtlSeconds: REGION_CACHE_TTL_SECONDS,
      providers,
    };

    this.cachedCatalog = {
      expiresAt: now + REGION_CACHE_TTL_SECONDS * 1000,
      response,
    };

    return response;
  }

  private async providerCatalog(
    providerId: ProviderId,
    label: string,
    sourceUrl: string,
    fetchLiveRegions: () => Promise<RawRegion[]>,
  ): Promise<CloudRegionProviderCatalog> {
    const fallbackRegions = fallbackRegionsForProvider(providerId);

    try {
      const liveRegions = await fetchLiveRegions();

      if (liveRegions.length === 0) {
        return toProviderCatalog(providerId, label, sourceUrl, 'fallback', fallbackRegions);
      }

      return toProviderCatalog(providerId, label, sourceUrl, 'live', [
        ...liveRegions.map((region) => ({ ...region, source: 'live' as const })),
        ...fallbackRegions
          .filter(
            (fallbackRegion) =>
              !liveRegions.some((liveRegion) => liveRegion.id === fallbackRegion.id),
          )
          .map((region) => ({ ...region, source: 'fallback' as const })),
      ]);
    } catch {
      return toProviderCatalog(providerId, label, sourceUrl, 'fallback', fallbackRegions);
    }
  }

  private async fetchAwsRegions(): Promise<RawRegion[]> {
    const body = JSON.parse(await this.fetchText(AWS_REGIONS_URL)) as Record<string, unknown>;

    return Object.values(body)
      .filter(isRecord)
      .filter((entry) => stringField(entry, 'type') === 'AWS Region')
      .map((entry) => ({
        id: stringField(entry, 'code'),
        label: stringField(entry, 'label') || stringField(entry, 'name'),
        location: stringField(entry, 'continent') || undefined,
      }))
      .filter((region) => isAwsRegionId(region.id) && region.label.length > 0);
  }

  private async fetchAzureRegions(): Promise<RawRegion[]> {
    const html = await this.fetchText(AZURE_REGIONS_URL);
    const regions = new Map<string, RawRegion>();
    const regionNamePattern = /"RegionName":\s*"([^"]+)"/g;
    let match: RegExpExecArray | null;

    while ((match = regionNamePattern.exec(html)) !== null) {
      const label = cleanAzureRegionName(match[1]);
      const id = azureRegionId(label);

      if (label && id) {
        regions.set(id, {
          id,
          label,
        });
      }
    }

    return [...regions.values()];
  }

  private async fetchGcpRegions(): Promise<RawRegion[]> {
    const response = JSON.parse(await this.fetchText(GCP_REGIONS_URL)) as GcpIpRangesResponse;
    const scopes = new Set<string>();

    response.prefixes?.forEach((prefix) => {
      if (prefix.service === 'Google Cloud' && prefix.scope && isGcpRegionId(prefix.scope)) {
        scopes.add(prefix.scope);
      }
    });

    return [...scopes].map((id) => ({
      id,
      label: gcpRegionLabel(id),
    }));
  }

  private async fetchText(url: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await this.fetchImpl(url, {
        headers: {
          accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Region catalog request failed: ${response.status}`);
      }

      return response.text();
    } finally {
      clearTimeout(timeout);
    }
  }
}

function toProviderCatalog(
  providerId: ProviderId,
  label: string,
  sourceUrl: string,
  source: RegionCatalogSource,
  regions: Array<RawRegion & { source?: RegionCatalogSource }>,
): CloudRegionProviderCatalog {
  const deduped = new Map<string, CloudRegion>();

  regions.forEach((region) => {
    if (!region.id || deduped.has(region.id)) {
      return;
    }

    deduped.set(region.id, {
      providerId,
      id: region.id,
      label: region.label || region.id,
      location: region.location,
      source: region.source ?? source,
    });
  });

  return {
    providerId,
    label,
    source,
    sourceUrl,
    calculatorUrl: calculatorUrlForProvider(providerId),
    regions: [...deduped.values()].sort((left, right) =>
      left.label.localeCompare(right.label, 'en-US', { numeric: true }),
    ),
  };
}

function fallbackRegionsForProvider(
  providerId: ProviderId,
): Array<RawRegion & { source: 'fallback' }> {
  switch (providerId) {
    case 'aws':
      return AWS_FALLBACK_REGIONS.map((region) => ({ ...region, source: 'fallback' }));
    case 'azure':
      return AZURE_FALLBACK_REGIONS.map((region) => ({ ...region, source: 'fallback' }));
    case 'gcp':
      return GCP_FALLBACK_REGIONS.map((region) => ({ ...region, source: 'fallback' }));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type AwsIpRangeStringField = 'code' | 'continent' | 'label' | 'name' | 'type';

const AWS_IP_RANGE_STRING_FIELD_READERS = new Map<
  AwsIpRangeStringField,
  (record: Record<string, unknown>) => unknown
>([
  ['code', (record) => record.code],
  ['continent', (record) => record.continent],
  ['label', (record) => record.label],
  ['name', (record) => record.name],
  ['type', (record) => record.type],
]);

function stringField(record: Record<string, unknown>, key: AwsIpRangeStringField): string {
  const value = AWS_IP_RANGE_STRING_FIELD_READERS.get(key)?.(record);

  return typeof value === 'string' ? value.trim() : '';
}

function isAwsRegionId(value: string): boolean {
  return /^[a-z]{2}-[a-z-]+-\d+$/.test(value);
}

function isGcpRegionId(value: string): boolean {
  return /^(africa|asia|australia|europe|me|northamerica|southamerica|us)-[a-z0-9-]+[0-9]$/.test(
    value,
  );
}

function cleanAzureRegionName(value: string): string {
  return value.replace(/\*+/g, '').replace(/\s+/g, ' ').trim();
}

function azureRegionId(label: string): string {
  switch (label) {
    case 'Arizona':
      return 'usgovarizona';
    case 'Texas':
      return 'usgovtexas';
    case 'Virginia':
      return 'usgovvirginia';
    default:
      return label.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
}

function regionCodeToLabel(id: string): string {
  return id
    .split('-')
    .map((part) => part.replace(/([a-z]+)([0-9]+)$/i, '$1 $2'))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function gcpRegionLabel(id: string): string {
  return GCP_REGION_LABEL_LOOKUP.get(id) ?? regionCodeToLabel(id);
}

function calculatorUrlForProvider(providerId: ProviderId): string {
  switch (providerId) {
    case 'aws':
      return 'https://calculator.aws/#/';
    case 'azure':
      return 'https://azure.microsoft.com/en-us/pricing/calculator/';
    case 'gcp':
      return 'https://cloud.google.com/products/calculator';
  }
}

const AWS_FALLBACK_REGIONS: RawRegion[] = [
  { id: 'af-south-1', label: 'Africa (Cape Town)' },
  { id: 'ap-east-1', label: 'Asia Pacific (Hong Kong)' },
  { id: 'ap-east-2', label: 'Asia Pacific (Taipei)' },
  { id: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
  { id: 'ap-northeast-2', label: 'Asia Pacific (Seoul)' },
  { id: 'ap-northeast-3', label: 'Asia Pacific (Osaka)' },
  { id: 'ap-south-1', label: 'Asia Pacific (Mumbai)' },
  { id: 'ap-south-2', label: 'Asia Pacific (Hyderabad)' },
  { id: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
  { id: 'ap-southeast-2', label: 'Asia Pacific (Sydney)' },
  { id: 'ap-southeast-3', label: 'Asia Pacific (Jakarta)' },
  { id: 'ap-southeast-4', label: 'Asia Pacific (Melbourne)' },
  { id: 'ap-southeast-5', label: 'Asia Pacific (Malaysia)' },
  { id: 'ap-southeast-6', label: 'Asia Pacific (New Zealand)' },
  { id: 'ap-southeast-7', label: 'Asia Pacific (Thailand)' },
  { id: 'ca-central-1', label: 'Canada (Central)' },
  { id: 'ca-west-1', label: 'Canada West (Calgary)' },
  { id: 'eu-central-1', label: 'Europe (Frankfurt)' },
  { id: 'eu-central-2', label: 'Europe (Zurich)' },
  { id: 'eu-north-1', label: 'Europe (Stockholm)' },
  { id: 'eu-south-1', label: 'Europe (Milan)' },
  { id: 'eu-south-2', label: 'Europe (Spain)' },
  { id: 'eu-west-1', label: 'Europe (Ireland)' },
  { id: 'eu-west-2', label: 'Europe (London)' },
  { id: 'eu-west-3', label: 'Europe (Paris)' },
  { id: 'il-central-1', label: 'Israel (Tel Aviv)' },
  { id: 'me-central-1', label: 'Middle East (UAE)' },
  { id: 'me-south-1', label: 'Middle East (Bahrain)' },
  { id: 'mx-central-1', label: 'Mexico (Central)' },
  { id: 'sa-east-1', label: 'South America (Sao Paulo)' },
  { id: 'us-east-1', label: 'US East (N. Virginia)' },
  { id: 'us-east-2', label: 'US East (Ohio)' },
  { id: 'us-west-1', label: 'US West (N. California)' },
  { id: 'us-west-2', label: 'US West (Oregon)' },
];

const AZURE_FALLBACK_REGIONS: RawRegion[] = [
  { id: 'attatlanta1', label: 'ATT Atlanta 1' },
  { id: 'attdallas1', label: 'ATT Dallas 1' },
  { id: 'attdetroit1', label: 'ATT Detroit 1' },
  { id: 'attnewyork1', label: 'ATT New York 1' },
  { id: 'australiacentral', label: 'Australia Central' },
  { id: 'australiacentral2', label: 'Australia Central 2' },
  { id: 'australiaeast', label: 'Australia East' },
  { id: 'australiasoutheast', label: 'Australia Southeast' },
  { id: 'austriaeast', label: 'Austria East' },
  { id: 'belgiumcentral', label: 'Belgium Central' },
  { id: 'brazilsouth', label: 'Brazil South' },
  { id: 'brazilsoutheast', label: 'Brazil Southeast' },
  { id: 'canadacentral', label: 'Canada Central' },
  { id: 'canadaeast', label: 'Canada East' },
  { id: 'centralindia', label: 'Central India' },
  { id: 'centralus', label: 'Central US' },
  { id: 'chilecentral', label: 'Chile Central' },
  { id: 'chinaeast', label: 'China East' },
  { id: 'chinaeast2', label: 'China East 2' },
  { id: 'chinaeast3', label: 'China East 3' },
  { id: 'chinanorth', label: 'China North' },
  { id: 'chinanorth2', label: 'China North 2' },
  { id: 'chinanorth3', label: 'China North 3' },
  { id: 'deloscloudgermanycentral', label: 'Delos Cloud Germany Central' },
  { id: 'deloscloudgermanynorth', label: 'Delos Cloud Germany North' },
  { id: 'denmarkeast', label: 'Denmark East' },
  { id: 'eastasia', label: 'East Asia' },
  { id: 'eastus', label: 'East US' },
  { id: 'eastus2', label: 'East US 2' },
  { id: 'francecentral', label: 'France Central' },
  { id: 'francesouth', label: 'France South' },
  { id: 'germanynorth', label: 'Germany North' },
  { id: 'germanywestcentral', label: 'Germany West Central' },
  { id: 'indiasouthcentral', label: 'India South Central' },
  { id: 'indonesiacentral', label: 'Indonesia Central' },
  { id: 'israelcentral', label: 'Israel Central' },
  { id: 'israelnorthwest', label: 'Israel Northwest' },
  { id: 'italynorth', label: 'Italy North' },
  { id: 'japaneast', label: 'Japan East' },
  { id: 'japanwest', label: 'Japan West' },
  { id: 'jioindiacentral', label: 'Jio India Central' },
  { id: 'jioindiawest', label: 'Jio India West' },
  { id: 'koreacentral', label: 'Korea Central' },
  { id: 'koreasouth', label: 'Korea South' },
  { id: 'malaysiawest', label: 'Malaysia West' },
  { id: 'mexicocentral', label: 'Mexico Central' },
  { id: 'newzealandnorth', label: 'New Zealand North' },
  { id: 'northcentralus', label: 'North Central US' },
  { id: 'northeurope', label: 'North Europe' },
  { id: 'norwayeast', label: 'Norway East' },
  { id: 'norwaywest', label: 'Norway West' },
  { id: 'polandcentral', label: 'Poland Central' },
  { id: 'portland', label: 'Portland' },
  { id: 'qatarcentral', label: 'Qatar Central' },
  { id: 'sgxsingapore1', label: 'SGX Singapore 1' },
  { id: 'southafricanorth', label: 'South Africa North' },
  { id: 'southafricawest', label: 'South Africa West' },
  { id: 'southcentralus', label: 'South Central US' },
  { id: 'southcentralus2', label: 'South Central US 2' },
  { id: 'southeastasia', label: 'Southeast Asia' },
  { id: 'southeastus', label: 'Southeast US' },
  { id: 'southindia', label: 'South India' },
  { id: 'southwestus', label: 'Southwest US' },
  { id: 'spaincentral', label: 'Spain Central' },
  { id: 'swedencentral', label: 'Sweden Central' },
  { id: 'swedensouth', label: 'Sweden South' },
  { id: 'switzerlandnorth', label: 'Switzerland North' },
  { id: 'switzerlandwest', label: 'Switzerland West' },
  { id: 'uaecentral', label: 'UAE Central' },
  { id: 'uaenorth', label: 'UAE North' },
  { id: 'uksouth', label: 'UK South' },
  { id: 'ukwest', label: 'UK West' },
  { id: 'usgovarizona', label: 'US Gov Arizona' },
  { id: 'usgoviowa', label: 'US Gov Iowa' },
  { id: 'usgovtexas', label: 'US Gov Texas' },
  { id: 'usgovvirginia', label: 'US Gov Virginia' },
  { id: 'westcentralus', label: 'West Central US' },
  { id: 'westeurope', label: 'West Europe' },
  { id: 'westindia', label: 'West India' },
  { id: 'westus', label: 'West US' },
  { id: 'westus2', label: 'West US 2' },
  { id: 'westus3', label: 'West US 3' },
];

const GCP_REGION_LABELS: Record<string, string> = {
  'africa-south1': 'Africa South (Johannesburg)',
  'asia-east1': 'Asia East (Taiwan)',
  'asia-east2': 'Asia East (Hong Kong)',
  'asia-northeast1': 'Asia Northeast (Tokyo)',
  'asia-northeast2': 'Asia Northeast (Osaka)',
  'asia-northeast3': 'Asia Northeast (Seoul)',
  'asia-south1': 'Asia South (Mumbai)',
  'asia-south2': 'Asia South (Delhi)',
  'asia-southeast1': 'Asia Southeast (Singapore)',
  'asia-southeast2': 'Asia Southeast (Jakarta)',
  'asia-southeast3': 'Asia Southeast (Malaysia)',
  'australia-southeast1': 'Australia Southeast (Sydney)',
  'australia-southeast2': 'Australia Southeast (Melbourne)',
  'europe-central2': 'Europe Central (Warsaw)',
  'europe-north1': 'Europe North (Finland)',
  'europe-north2': 'Europe North (Stockholm)',
  'europe-southwest1': 'Europe Southwest (Madrid)',
  'europe-west1': 'Europe West (Belgium)',
  'europe-west2': 'Europe West (London)',
  'europe-west3': 'Europe West (Frankfurt)',
  'europe-west4': 'Europe West (Netherlands)',
  'europe-west6': 'Europe West (Zurich)',
  'europe-west8': 'Europe West (Milan)',
  'europe-west9': 'Europe West (Paris)',
  'europe-west10': 'Europe West (Berlin)',
  'europe-west12': 'Europe West (Turin)',
  'europe-west15': 'Europe West (Madrid low CO2)',
  'me-central1': 'Middle East Central (Doha)',
  'me-central2': 'Middle East Central (Dammam)',
  'me-west1': 'Middle East West (Tel Aviv)',
  'northamerica-northeast1': 'North America Northeast (Montreal)',
  'northamerica-northeast2': 'North America Northeast (Toronto)',
  'northamerica-south1': 'North America South (Mexico)',
  'southamerica-east1': 'South America East (Sao Paulo)',
  'southamerica-west1': 'South America West (Santiago)',
  'us-central1': 'US Central (Iowa)',
  'us-central2': 'US Central (Oklahoma)',
  'us-east1': 'US East (South Carolina)',
  'us-east4': 'US East (Northern Virginia)',
  'us-east5': 'US East (Columbus)',
  'us-east7': 'US East (Virginia)',
  'us-south1': 'US South (Dallas)',
  'us-west1': 'US West (Oregon)',
  'us-west2': 'US West (Los Angeles)',
  'us-west3': 'US West (Salt Lake City)',
  'us-west4': 'US West (Las Vegas)',
  'us-west8': 'US West (Phoenix)',
};

const GCP_REGION_LABEL_LOOKUP = new Map(Object.entries(GCP_REGION_LABELS));

const GCP_FALLBACK_REGIONS: RawRegion[] = Object.entries(GCP_REGION_LABELS).map(([id, label]) => ({
  id,
  label,
}));
