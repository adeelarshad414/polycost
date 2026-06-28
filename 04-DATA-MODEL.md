# PolyCost - Data Model

## 1. Normalized Workload Specification

The Normalized Workload Specification (NWS) is the central contract of the system.
Every input method produces this shape, and every comparison, report, and future
feature consumes it.

Treat changes to this schema as significant decisions requiring a version bump and
migration plan, not casual edits.

```typescript
interface NormalizedWorkloadSpec {
  schemaVersion: string; // e.g. "1.0"; bump on any breaking change

  metadata: {
    sourceType:
      | 'natural_language'
      | 'structured_form'
      | 'drawio_diagram'
      | 'terraform';
    rawInput?: string;
    createdAt: string; // ISO8601
  };

  workload: {
    name?: string;
    type:
      | 'web_app'
      | 'api_backend'
      | 'static_site'
      | 'batch_processing'
      | 'data_pipeline'
      | 'ml_workload'
      | 'other';
    expectedUsers?: {
      dailyActiveUsers?: number;
      peakConcurrentUsers?: number;
    };
    region: {
      preference?: string;
      isDefault: boolean;
    };
  };

  compute: Array<{
    role: string;
    vcpu?: number;
    memoryGb?: number;
    instanceCount?: number;
    scalingType: 'fixed' | 'autoscaling';
    autoscalingRange?: { min: number; max: number };
  }>;

  storage: Array<{
    role: string;
    type: 'object' | 'block' | 'file';
    sizeGb: number;
    accessPattern?: 'frequent' | 'infrequent' | 'archive';
  }>;

  database: Array<{
    role: string;
    engine:
      | 'postgres'
      | 'mysql'
      | 'mongodb'
      | 'redis'
      | 'generic_relational'
      | 'generic_nosql';
    sizeGb?: number;
    highAvailability: boolean;
    managedServicePreference?: string;
  }>;

  network: {
    estimatedMonthlyEgressGb?: number;
    cdn: boolean;
    loadBalancer: boolean;
  };

  availability: {
    multiAz: boolean;
    multiRegion: boolean;
    slaTarget?: string;
  };

  sourceTraceability?: Array<{
    nwsPath: string;
    sourceRef: string;
  }>;
}
```

### Validation rules

Validation is enforced by `NWSValidator` and must not be duplicated elsewhere.

- `workload.type` is required.
- Other fields can be partially populated. The comparison engine should price what it
  can while flagging missing data.
- At least one of `compute`, `storage`, or `database` must be non-empty.
- An entirely empty workload is rejected with a clear error instead of priced as `$0`.
- `schemaVersion` must match a version this build of PolyCost knows how to handle.
- Schema-version mismatches are rejected with a clear migration error instead of
  silently coerced.

## 2. Normalized Pricing Catalog

The nightly ETL populates this catalog, and adapters read from it at comparison time.

```sql
CREATE TABLE pricing_catalog (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider         VARCHAR(20) NOT NULL,
    service_category VARCHAR(50) NOT NULL,
    service_name     VARCHAR(200) NOT NULL,
    sku_id           VARCHAR(200) NOT NULL,
    sku_description  TEXT,
    region           VARCHAR(50) NOT NULL,
    unit             VARCHAR(50) NOT NULL,
    unit_price_usd   NUMERIC(14, 6) NOT NULL,
    attributes       JSONB,
    effective_date   TIMESTAMP NOT NULL,
    fetched_at       TIMESTAMP NOT NULL DEFAULT now(),

    UNIQUE (provider, sku_id, region, effective_date)
);

CREATE INDEX idx_pricing_provider_category
    ON pricing_catalog (provider, service_category);

CREATE INDEX idx_pricing_region
    ON pricing_catalog (region);
```

Provider values are `aws`, `azure`, and `gcp`. Service categories are expected to use
cloud-neutral labels such as `compute`, `storage`, `database`, and `network`.

`attributes` stores category-specific SKU metadata such as vCPU count, memory, storage
tier, and provider-native attributes needed by adapters.

## 3. Equivalent-Service Mapping

This is the curated dataset referenced in the MVP scope. It maps internal workload
tiers to provider-specific SKU patterns.

```sql
CREATE TABLE service_equivalence_map (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category            VARCHAR(50) NOT NULL,
    tier_label          VARCHAR(100) NOT NULL,
    aws_sku_pattern     VARCHAR(200),
    azure_sku_pattern   VARCHAR(200),
    gcp_sku_pattern     VARCHAR(200),
    notes               TEXT,
    is_approximate      BOOLEAN NOT NULL DEFAULT false
);
```

`is_approximate` is true when one cloud's native service has no exact equivalent. This
field drives the approximation labels shown in comparison results and exports.

## 4. ETL Job History

ETL history powers the "pricing last updated" indicator and makes provider refresh
failures visible.

```sql
CREATE TABLE pricing_etl_runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider        VARCHAR(20) NOT NULL,
    started_at      TIMESTAMP NOT NULL,
    completed_at    TIMESTAMP,
    status          VARCHAR(20) NOT NULL,
    records_updated INTEGER,
    error_detail    TEXT
);
```

Status values are `success`, `partial`, and `failed`.

## 5. Comparison Snapshots

Comparison results are persisted so exports can be regenerated without re-pricing.

```sql
CREATE TABLE comparisons (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nws_snapshot    JSONB NOT NULL,
    result_snapshot JSONB NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    pricing_as_of   TIMESTAMP NOT NULL
);
```

Pricing changes nightly. If a user exports a report a week after running the
comparison, the report must reflect the numbers they saw, not the latest pricing.
Snapshotting both `nws_snapshot` and `result_snapshot` keeps every export
reproducible and prevents report numbers from drifting away from the on-screen
comparison.

## 6. ComparisonResult

This shape is both the API response for comparisons and the input to report
generators.

```typescript
interface ComparisonResult {
  comparisonId: string;
  pricingAsOf: string; // ISO8601, tied to pricing_etl_runs

  providers: Array<{
    providerId: 'aws' | 'azure' | 'gcp';
    lineItems: Array<{
      category: string;
      description: string;
      isApproximate: boolean;
      baseMonthlyCostUsd: number;
    }>;
    totals: {
      daily: number;
      weekly: number;
      monthly: number;
      quarterly: number;
      yearly: number;
    };
  }>;

  cheapestProviderId: 'aws' | 'azure' | 'gcp';
}
```

`cheapestProviderId` is a convenience field computed by monthly total.
