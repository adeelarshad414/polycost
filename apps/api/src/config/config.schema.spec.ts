import { validateConfig } from './config.schema';

const baseConfig = {
  NODE_ENV: 'development',
  DB_HOST: 'postgres',
  DB_NAME: 'polycost_dev',
  REDIS_HOST: 'redis',
  VAULT_ADDR: 'http://vault:8200',
};

const productionArtifactConfig = {
  INVOICE_ARTIFACT_STORAGE_BACKEND: 'aws-s3',
  INVOICE_ARTIFACT_OBJECT_STORE_NAME: 'polycost-invoice-artifacts',
  INVOICE_ARTIFACT_OBJECT_STORE_REGION: 'us-east-1',
  INVOICE_ARTIFACT_KMS_KEY_REFERENCE: 'arn:aws:kms:us-east-1:111122223333:key/demo',
  INVOICE_ARTIFACT_MALWARE_SCANNER_MODE: 'http-webhook',
  INVOICE_ARTIFACT_MALWARE_SCANNER_URL: 'https://scanner.example.com/polycost/artifacts',
  INVOICE_ARTIFACT_MALWARE_SCANNER_SECRET: 'production-scanner-webhook-secret',
  INVOICE_ARTIFACT_RETENTION_ENFORCEMENT_MODE: 'delete-expired',
  INVOICE_EVIDENCE_RECEIPT_MODE: 'external-webhook',
  INVOICE_EVIDENCE_RECEIPT_SIGNING_KEY_REFERENCE:
    'arn:aws:kms:us-east-1:111122223333:alias/polycost-evidence-receipts',
  INVOICE_EVIDENCE_RECEIPT_SIGNING_SECRET: 'production-evidence-receipt-signing-secret',
  INVOICE_EVIDENCE_NOTARY_WEBHOOK_URL: 'https://worm.example.com/polycost/evidence-receipts',
  INVOICE_EVIDENCE_WORM_RETENTION_MODE: 'external-worm-receiver',
};

describe('config schema', () => {
  it('applies safe defaults for non-sensitive config', () => {
    const config = validateConfig(baseConfig);

    expect(config.PORT).toBe(3000);
    expect(config.DB_PORT).toBe(5432);
    expect(config.REDIS_PORT).toBe(6379);
    expect(config.CURRENCY_SYNC_SCHEDULE_CRON).toBe('0 * * * *');
    expect(config.ALERT_EVALUATOR_SCHEDULE_CRON).toBe('*/15 * * * *');
    expect(config.SHARE_LINK_CLEANUP_SCHEDULE_CRON).toBe('0 3 * * *');
    expect(config.PRICING_SYNC_ALERT_WEBHOOK_URL).toBeUndefined();
    expect(config.EXCHANGE_RATE_API_URL).toBe('https://api.frankfurter.app/latest');
    expect(config.EXCHANGE_RATE_TARGET_CURRENCIES).toContain('EUR');
    expect(config.PRICING_ETL_DEFAULT_REGION_AWS).toBe('us-east-1');
    expect(config.PRICING_ETL_DEFAULT_REGION_AZURE).toBe('eastus');
    expect(config.PRICING_ETL_DEFAULT_REGION_GCP).toBe('us-central1');
    expect(config.USE_MOCK_PROVIDERS).toBe(true);
    expect(config.PRICING_ETL_RUN_ON_BOOT).toBe(true);
    expect(config.RATE_LIMIT_COMPARISON_PER_MINUTE).toBe(30);
    expect(config.RATE_LIMIT_EXPORT_PER_MINUTE).toBe(10);
    expect(config.RATE_LIMIT_SHARE_LINK_PER_MINUTE).toBe(20);
    expect(config.RATE_LIMIT_PUBLIC_READ_PER_MINUTE).toBe(60);
    expect(config.RATE_LIMIT_PUBLIC_WRITE_PER_MINUTE).toBe(30);
    expect(config.RATE_LIMIT_AUTH_PER_MINUTE).toBe(10);
    expect(config.RATE_LIMIT_DIAGRAM_PARSE_PER_MINUTE).toBe(10);
    expect(config.NL_PARSE_MAX_INPUT_CHARS).toBe(4000);
    expect(config.DIAGRAM_TEMP_DIR).toBe('/tmp/polycost-diagram-imports');
    expect(config.DIAGRAM_LLM_CLASSIFIER_ENDPOINT).toBeUndefined();
    expect(config.DIAGRAM_LLM_CLASSIFIER_MODEL).toBeUndefined();
    expect(config.FEATURE_RESERVED_PRICING).toBe(true);
    expect(config.AUTH_SSO_STATE_SECRET).toBe('CHANGE_ME_DEV_ONLY_SSO_STATE_SECRET');
    expect(config.AUTH_INVITE_DELIVERY_MODE).toBe('panel');
    expect(config.AUTH_INVITE_DELIVERY_WEBHOOK_URL).toBeUndefined();
    expect(config.AUTH_INVITE_DELIVERY_WEBHOOK_SECRET).toBeUndefined();
    expect(config.AUTH_AUDIT_EXPORT_MODE).toBe('disabled');
    expect(config.AUTH_AUDIT_EXPORT_WEBHOOK_URL).toBeUndefined();
    expect(config.AUTH_AUDIT_EXPORT_WEBHOOK_SECRET).toBeUndefined();
    expect(config.AUTH_AUDIT_EXPORT_SCHEDULE_CRON).toBe('*/5 * * * *');
    expect(config.AUTH_AUDIT_EXPORT_BATCH_SIZE).toBe(50);
    expect(config.AUTH_AUDIT_EXPORT_MAX_ATTEMPTS).toBe(5);
    expect(config.INVOICE_ARTIFACT_STORAGE_BACKEND).toBe('database-bytea');
    expect(config.INVOICE_ARTIFACT_MALWARE_SCANNER_MODE).toBe('eicar-signature-only');
    expect(config.INVOICE_ARTIFACT_RETENTION_ENFORCEMENT_MODE).toBe('report-only');
    expect(config.INVOICE_EVIDENCE_RECEIPT_MODE).toBe('metadata-only');
    expect(config.INVOICE_EVIDENCE_RECEIPT_SIGNING_KEY_REFERENCE).toBeUndefined();
    expect(config.INVOICE_EVIDENCE_RECEIPT_SIGNING_SECRET).toBeUndefined();
    expect(config.INVOICE_EVIDENCE_NOTARY_WEBHOOK_URL).toBeUndefined();
    expect(config.INVOICE_EVIDENCE_WORM_RETENTION_MODE).toBe('not-configured');
  });

  it('fails fast for invalid config', () => {
    expect(() =>
      validateConfig({
        ...baseConfig,
        NODE_ENV: 'local',
      }),
    ).toThrow();
  });

  it('rejects wildcard CORS origins for production-bound environments', () => {
    expect(() =>
      validateConfig({
        ...baseConfig,
        NODE_ENV: 'production',
        ...productionArtifactConfig,
        CORS_ALLOWED_ORIGINS: '*',
      }),
    ).toThrow('Wildcard CORS origins are not allowed in staging or production.');

    expect(() =>
      validateConfig({
        ...baseConfig,
        NODE_ENV: 'staging',
        ...productionArtifactConfig,
        CORS_ALLOWED_ORIGINS: 'https://app.example.com,*',
      }),
    ).toThrow('Wildcard CORS origins are not allowed in staging or production.');
  });

  it('keeps wildcard CORS available only for local test harnesses', () => {
    expect(
      validateConfig({
        ...baseConfig,
        NODE_ENV: 'test',
        CORS_ALLOWED_ORIGINS: '*',
      }).CORS_ALLOWED_ORIGINS,
    ).toBe('*');
  });

  it('accepts optional pricing sync alert webhooks', () => {
    const config = validateConfig({
      ...baseConfig,
      PRICING_SYNC_ALERT_WEBHOOK_URL: 'https://hooks.example.com/polycost-pricing-sync',
    });

    expect(config.PRICING_SYNC_ALERT_WEBHOOK_URL).toBe(
      'https://hooks.example.com/polycost-pricing-sync',
    );
  });

  it('treats blank optional webhooks as unset', () => {
    const config = validateConfig({
      ...baseConfig,
      PRICING_SYNC_ALERT_WEBHOOK_URL: '',
      AUTH_INVITE_DELIVERY_WEBHOOK_URL: '',
      AUTH_INVITE_DELIVERY_WEBHOOK_SECRET: '',
      AUTH_AUDIT_EXPORT_WEBHOOK_URL: '',
      AUTH_AUDIT_EXPORT_WEBHOOK_SECRET: '',
    });

    expect(config.PRICING_SYNC_ALERT_WEBHOOK_URL).toBeUndefined();
    expect(config.AUTH_INVITE_DELIVERY_WEBHOOK_URL).toBeUndefined();
    expect(config.AUTH_INVITE_DELIVERY_WEBHOOK_SECRET).toBeUndefined();
    expect(config.AUTH_AUDIT_EXPORT_WEBHOOK_URL).toBeUndefined();
    expect(config.AUTH_AUDIT_EXPORT_WEBHOOK_SECRET).toBeUndefined();
  });

  it('accepts signed invite delivery and audit export webhooks for production-bound environments', () => {
    const config = validateConfig({
      ...baseConfig,
      NODE_ENV: 'production',
      ...productionArtifactConfig,
      CORS_ALLOWED_ORIGINS: 'https://polycost.example.com',
      AUTH_SSO_STATE_SECRET: 'production-sso-state-secret-value',
      AUTH_INVITE_DELIVERY_MODE: 'webhook',
      AUTH_INVITE_DELIVERY_WEBHOOK_URL: 'https://mail.example.com/polycost/invites',
      AUTH_INVITE_DELIVERY_WEBHOOK_SECRET: 'production-invite-webhook-secret',
      AUTH_AUDIT_EXPORT_MODE: 'webhook',
      AUTH_AUDIT_EXPORT_WEBHOOK_URL: 'https://siem.example.com/polycost/audit-events',
      AUTH_AUDIT_EXPORT_WEBHOOK_SECRET: 'production-audit-export-secret',
    });

    expect(config.AUTH_INVITE_DELIVERY_MODE).toBe('webhook');
    expect(config.AUTH_INVITE_DELIVERY_WEBHOOK_URL).toBe(
      'https://mail.example.com/polycost/invites',
    );
    expect(config.AUTH_AUDIT_EXPORT_MODE).toBe('webhook');
    expect(config.AUTH_AUDIT_EXPORT_WEBHOOK_URL).toBe(
      'https://siem.example.com/polycost/audit-events',
    );
  });

  it('requires production-bound invite delivery to use signed HTTPS webhooks', () => {
    expect(() =>
      validateConfig({
        ...baseConfig,
        NODE_ENV: 'staging',
        ...productionArtifactConfig,
        CORS_ALLOWED_ORIGINS: 'https://polycost.example.com',
        AUTH_SSO_STATE_SECRET: 'production-sso-state-secret-value',
        AUTH_AUDIT_EXPORT_MODE: 'webhook',
        AUTH_AUDIT_EXPORT_WEBHOOK_URL: 'https://siem.example.com/polycost/audit-events',
        AUTH_AUDIT_EXPORT_WEBHOOK_SECRET: 'production-audit-export-secret',
      }),
    ).toThrow('Staging and production invite delivery must use the webhook provider.');

    expect(() =>
      validateConfig({
        ...baseConfig,
        NODE_ENV: 'production',
        ...productionArtifactConfig,
        CORS_ALLOWED_ORIGINS: 'https://polycost.example.com',
        AUTH_SSO_STATE_SECRET: 'production-sso-state-secret-value',
        AUTH_INVITE_DELIVERY_MODE: 'webhook',
        AUTH_INVITE_DELIVERY_WEBHOOK_URL: 'http://mail.example.com/polycost/invites',
        AUTH_INVITE_DELIVERY_WEBHOOK_SECRET: 'production-invite-webhook-secret',
        AUTH_AUDIT_EXPORT_MODE: 'webhook',
        AUTH_AUDIT_EXPORT_WEBHOOK_URL: 'https://siem.example.com/polycost/audit-events',
        AUTH_AUDIT_EXPORT_WEBHOOK_SECRET: 'production-audit-export-secret',
      }),
    ).toThrow('Invite delivery webhook URL must use HTTPS outside development.');

    expect(() =>
      validateConfig({
        ...baseConfig,
        AUTH_INVITE_DELIVERY_MODE: 'webhook',
      }),
    ).toThrow('AUTH_INVITE_DELIVERY_WEBHOOK_URL is required for webhook invite delivery.');
  });

  it('requires production-bound audit export to use signed HTTPS webhooks', () => {
    expect(() =>
      validateConfig({
        ...baseConfig,
        NODE_ENV: 'staging',
        ...productionArtifactConfig,
        CORS_ALLOWED_ORIGINS: 'https://polycost.example.com',
        AUTH_SSO_STATE_SECRET: 'production-sso-state-secret-value',
        AUTH_INVITE_DELIVERY_MODE: 'webhook',
        AUTH_INVITE_DELIVERY_WEBHOOK_URL: 'https://mail.example.com/polycost/invites',
        AUTH_INVITE_DELIVERY_WEBHOOK_SECRET: 'production-invite-webhook-secret',
      }),
    ).toThrow('Staging and production audit export must use the webhook provider.');

    expect(() =>
      validateConfig({
        ...baseConfig,
        NODE_ENV: 'production',
        ...productionArtifactConfig,
        CORS_ALLOWED_ORIGINS: 'https://polycost.example.com',
        AUTH_SSO_STATE_SECRET: 'production-sso-state-secret-value',
        AUTH_INVITE_DELIVERY_MODE: 'webhook',
        AUTH_INVITE_DELIVERY_WEBHOOK_URL: 'https://mail.example.com/polycost/invites',
        AUTH_INVITE_DELIVERY_WEBHOOK_SECRET: 'production-invite-webhook-secret',
        AUTH_AUDIT_EXPORT_MODE: 'webhook',
        AUTH_AUDIT_EXPORT_WEBHOOK_URL: 'http://siem.example.com/polycost/audit-events',
        AUTH_AUDIT_EXPORT_WEBHOOK_SECRET: 'production-audit-export-secret',
      }),
    ).toThrow('Audit export webhook URL must use HTTPS outside development.');

    expect(() =>
      validateConfig({
        ...baseConfig,
        AUTH_AUDIT_EXPORT_MODE: 'webhook',
      }),
    ).toThrow('AUTH_AUDIT_EXPORT_WEBHOOK_URL is required for audit export webhooks.');
  });

  it('allows production deployments to opt into live provider adapters and scheduled-only sync', () => {
    const config = validateConfig({
      ...baseConfig,
      NODE_ENV: 'production',
      ...productionArtifactConfig,
      USE_MOCK_PROVIDERS: 'false',
      PRICING_ETL_RUN_ON_BOOT: 'false',
      CORS_ALLOWED_ORIGINS: 'https://polycost.example.com',
      VAULT_TOKEN_FILE: '/run/polycost-vault-auth/token',
      AUTH_SSO_STATE_SECRET: 'production-sso-state-secret-value',
      AUTH_INVITE_DELIVERY_MODE: 'webhook',
      AUTH_INVITE_DELIVERY_WEBHOOK_URL: 'https://mail.example.com/polycost/invites',
      AUTH_INVITE_DELIVERY_WEBHOOK_SECRET: 'production-invite-webhook-secret',
      AUTH_AUDIT_EXPORT_MODE: 'webhook',
      AUTH_AUDIT_EXPORT_WEBHOOK_URL: 'https://siem.example.com/polycost/audit-events',
      AUTH_AUDIT_EXPORT_WEBHOOK_SECRET: 'production-audit-export-secret',
    });

    expect(config.USE_MOCK_PROVIDERS).toBe(false);
    expect(config.PRICING_ETL_RUN_ON_BOOT).toBe(false);
  });

  it('rejects real provider mode outside development when Vault token access is absent', () => {
    expect(() =>
      validateConfig({
        ...baseConfig,
        NODE_ENV: 'production',
        ...productionArtifactConfig,
        USE_MOCK_PROVIDERS: 'false',
        CORS_ALLOWED_ORIGINS: 'https://polycost.example.com',
        AUTH_SSO_STATE_SECRET: 'production-sso-state-secret-value',
        AUTH_INVITE_DELIVERY_MODE: 'webhook',
        AUTH_INVITE_DELIVERY_WEBHOOK_URL: 'https://mail.example.com/polycost/invites',
        AUTH_INVITE_DELIVERY_WEBHOOK_SECRET: 'production-invite-webhook-secret',
        AUTH_AUDIT_EXPORT_MODE: 'webhook',
        AUTH_AUDIT_EXPORT_WEBHOOK_URL: 'https://siem.example.com/polycost/audit-events',
        AUTH_AUDIT_EXPORT_WEBHOOK_SECRET: 'production-audit-export-secret',
      }),
    ).toThrow(
      'VAULT_TOKEN_FILE is required when real provider pricing is enabled outside development.',
    );
  });

  it('rejects dummy placeholder values outside development', () => {
    expect(() =>
      validateConfig({
        ...baseConfig,
        NODE_ENV: 'staging',
        ...productionArtifactConfig,
        AUTH_OIDC_CLIENT_ID: 'CHANGE_ME_DEV_ONLY',
        CORS_ALLOWED_ORIGINS: 'https://polycost.example.com',
        AUTH_SSO_STATE_SECRET: 'production-sso-state-secret-value',
        AUTH_INVITE_DELIVERY_MODE: 'webhook',
        AUTH_INVITE_DELIVERY_WEBHOOK_URL: 'https://mail.example.com/polycost/invites',
        AUTH_INVITE_DELIVERY_WEBHOOK_SECRET: 'production-invite-webhook-secret',
        AUTH_AUDIT_EXPORT_MODE: 'webhook',
        AUTH_AUDIT_EXPORT_WEBHOOK_URL: 'https://siem.example.com/polycost/audit-events',
        AUTH_AUDIT_EXPORT_WEBHOOK_SECRET: 'production-audit-export-secret',
      }),
    ).toThrow('CHANGE_ME_DEV_ONLY and dummy values are not allowed outside development.');
  });

  it('requires production-bound invoice artifact storage, KMS, scanner, and retention controls', () => {
    expect(() =>
      validateConfig({
        ...baseConfig,
        NODE_ENV: 'production',
        CORS_ALLOWED_ORIGINS: 'https://polycost.example.com',
        AUTH_SSO_STATE_SECRET: 'production-sso-state-secret-value',
        AUTH_INVITE_DELIVERY_MODE: 'webhook',
        AUTH_INVITE_DELIVERY_WEBHOOK_URL: 'https://mail.example.com/polycost/invites',
        AUTH_INVITE_DELIVERY_WEBHOOK_SECRET: 'production-invite-webhook-secret',
        AUTH_AUDIT_EXPORT_MODE: 'webhook',
        AUTH_AUDIT_EXPORT_WEBHOOK_URL: 'https://siem.example.com/polycost/audit-events',
        AUTH_AUDIT_EXPORT_WEBHOOK_SECRET: 'production-audit-export-secret',
      }),
    ).toThrow('Staging and production invoice artifact storage must use external object storage.');

    expect(() =>
      validateConfig({
        ...baseConfig,
        INVOICE_ARTIFACT_STORAGE_BACKEND: 'gcp-gcs',
      }),
    ).toThrow(
      'INVOICE_ARTIFACT_OBJECT_STORE_NAME is required for external invoice artifact storage.',
    );

    expect(() =>
      validateConfig({
        ...baseConfig,
        INVOICE_ARTIFACT_MALWARE_SCANNER_MODE: 'http-webhook',
      }),
    ).toThrow('INVOICE_ARTIFACT_MALWARE_SCANNER_URL is required for webhook artifact scanning.');
  });

  it('requires production-bound invoice evidence receipts and WORM retention posture', () => {
    expect(() =>
      validateConfig({
        ...baseConfig,
        NODE_ENV: 'production',
        ...productionArtifactConfig,
        INVOICE_EVIDENCE_RECEIPT_MODE: 'metadata-only',
        CORS_ALLOWED_ORIGINS: 'https://polycost.example.com',
        AUTH_SSO_STATE_SECRET: 'production-sso-state-secret-value',
        AUTH_INVITE_DELIVERY_MODE: 'webhook',
        AUTH_INVITE_DELIVERY_WEBHOOK_URL: 'https://mail.example.com/polycost/invites',
        AUTH_INVITE_DELIVERY_WEBHOOK_SECRET: 'production-invite-webhook-secret',
        AUTH_AUDIT_EXPORT_MODE: 'webhook',
        AUTH_AUDIT_EXPORT_WEBHOOK_URL: 'https://siem.example.com/polycost/audit-events',
        AUTH_AUDIT_EXPORT_WEBHOOK_SECRET: 'production-audit-export-secret',
      }),
    ).toThrow('Staging and production invoice evidence packets must use signed receipts.');

    expect(() =>
      validateConfig({
        ...baseConfig,
        INVOICE_EVIDENCE_RECEIPT_MODE: 'local-hmac',
      }),
    ).toThrow(
      'INVOICE_EVIDENCE_RECEIPT_SIGNING_KEY_REFERENCE is required for signed invoice evidence receipts.',
    );

    expect(() =>
      validateConfig({
        ...baseConfig,
        NODE_ENV: 'production',
        ...productionArtifactConfig,
        INVOICE_EVIDENCE_NOTARY_WEBHOOK_URL: 'http://worm.example.com/polycost/evidence-receipts',
        CORS_ALLOWED_ORIGINS: 'https://polycost.example.com',
        AUTH_SSO_STATE_SECRET: 'production-sso-state-secret-value',
        AUTH_INVITE_DELIVERY_MODE: 'webhook',
        AUTH_INVITE_DELIVERY_WEBHOOK_URL: 'https://mail.example.com/polycost/invites',
        AUTH_INVITE_DELIVERY_WEBHOOK_SECRET: 'production-invite-webhook-secret',
        AUTH_AUDIT_EXPORT_MODE: 'webhook',
        AUTH_AUDIT_EXPORT_WEBHOOK_URL: 'https://siem.example.com/polycost/audit-events',
        AUTH_AUDIT_EXPORT_WEBHOOK_SECRET: 'production-audit-export-secret',
      }),
    ).toThrow('Invoice evidence notary webhook URL must use HTTPS outside development.');
  });

  it('keeps secret-shaped values out of the schema', () => {
    const config = validateConfig(baseConfig);

    expect(Object.keys(config)).not.toContain('DB_PASSWORD');
    expect(Object.keys(config)).not.toContain('LLM_API_KEY');
    expect(Object.keys(config)).not.toContain('OPENAI_API_KEY');
  });
});

describe('OpenTelemetry configuration', () => {
  it('treats empty strings as unset', () => {
    // docker compose renders ${VAR:-} as an empty string when the variable is
    // not set, so every optional key has to tolerate '' rather than only
    // undefined. A bare .url() here took the API down at boot in CI.
    const config = validateConfig({
      ...baseConfig,
      OTEL_EXPORTER_OTLP_ENDPOINT: '',
      OTEL_SERVICE_NAME: '',
      OTEL_TRACES_SAMPLER_ARG: '',
      OTEL_SDK_DISABLED: '',
    });

    expect(config.OTEL_EXPORTER_OTLP_ENDPOINT).toBeUndefined();
    expect(config.OTEL_SERVICE_NAME).toBeUndefined();
    expect(config.OTEL_TRACES_SAMPLER_ARG).toBeUndefined();
    expect(config.OTEL_SDK_DISABLED).toBeUndefined();
  });

  it('validates the config with no OTEL keys at all', () => {
    expect(() => validateConfig(baseConfig)).not.toThrow();
  });

  it('accepts a configured collector', () => {
    const config = validateConfig({
      ...baseConfig,
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel-collector:4318',
      OTEL_TRACES_SAMPLER_ARG: '0.25',
    });

    expect(config.OTEL_EXPORTER_OTLP_ENDPOINT).toBe('http://otel-collector:4318');
    expect(config.OTEL_TRACES_SAMPLER_ARG).toBe(0.25);
  });

  it('rejects a malformed endpoint rather than silently disabling tracing', () => {
    expect(() =>
      validateConfig({ ...baseConfig, OTEL_EXPORTER_OTLP_ENDPOINT: 'not-a-url' }),
    ).toThrow();
  });

  it('rejects a sample ratio outside 0..1', () => {
    expect(() => validateConfig({ ...baseConfig, OTEL_TRACES_SAMPLER_ARG: '2' })).toThrow();
  });
});
