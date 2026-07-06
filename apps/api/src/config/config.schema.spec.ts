import { validateConfig } from './config.schema';

const baseConfig = {
  NODE_ENV: 'development',
  DB_HOST: 'postgres',
  DB_NAME: 'polycost_dev',
  REDIS_HOST: 'redis',
  VAULT_ADDR: 'http://vault:8200',
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
    expect(config.RATE_LIMIT_DIAGRAM_PARSE_PER_MINUTE).toBe(10);
    expect(config.NL_PARSE_MAX_INPUT_CHARS).toBe(4000);
    expect(config.DIAGRAM_TEMP_DIR).toBe('/tmp/polycost-diagram-imports');
    expect(config.DIAGRAM_LLM_CLASSIFIER_ENDPOINT).toBeUndefined();
    expect(config.DIAGRAM_LLM_CLASSIFIER_MODEL).toBeUndefined();
    expect(config.FEATURE_RESERVED_PRICING).toBe(true);
    expect(config.AUTH_SSO_STATE_SECRET).toBe('CHANGE_ME_DEV_ONLY_SSO_STATE_SECRET');
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
        CORS_ALLOWED_ORIGINS: '*',
      }),
    ).toThrow('Wildcard CORS origins are not allowed in staging or production.');

    expect(() =>
      validateConfig({
        ...baseConfig,
        NODE_ENV: 'staging',
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
    });

    expect(config.PRICING_SYNC_ALERT_WEBHOOK_URL).toBeUndefined();
  });

  it('allows production deployments to opt into live provider adapters and scheduled-only sync', () => {
    const config = validateConfig({
      ...baseConfig,
      NODE_ENV: 'production',
      USE_MOCK_PROVIDERS: 'false',
      PRICING_ETL_RUN_ON_BOOT: 'false',
      CORS_ALLOWED_ORIGINS: 'https://polycost.example.com',
      VAULT_TOKEN_FILE: '/run/polycost-vault-auth/token',
      AUTH_SSO_STATE_SECRET: 'production-sso-state-secret-value',
    });

    expect(config.USE_MOCK_PROVIDERS).toBe(false);
    expect(config.PRICING_ETL_RUN_ON_BOOT).toBe(false);
  });

  it('rejects real provider mode outside development when Vault token access is absent', () => {
    expect(() =>
      validateConfig({
        ...baseConfig,
        NODE_ENV: 'production',
        USE_MOCK_PROVIDERS: 'false',
        CORS_ALLOWED_ORIGINS: 'https://polycost.example.com',
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
        AUTH_OIDC_CLIENT_ID: 'CHANGE_ME_DEV_ONLY',
        CORS_ALLOWED_ORIGINS: 'https://polycost.example.com',
      }),
    ).toThrow('CHANGE_ME_DEV_ONLY and dummy values are not allowed outside development.');
  });

  it('keeps secret-shaped values out of the schema', () => {
    const config = validateConfig(baseConfig);

    expect(Object.keys(config)).not.toContain('DB_PASSWORD');
    expect(Object.keys(config)).not.toContain('LLM_API_KEY');
    expect(Object.keys(config)).not.toContain('OPENAI_API_KEY');
  });
});
