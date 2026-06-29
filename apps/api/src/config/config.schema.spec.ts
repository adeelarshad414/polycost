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
    expect(config.EXCHANGE_RATE_API_URL).toBe('https://api.frankfurter.app/latest');
    expect(config.EXCHANGE_RATE_TARGET_CURRENCIES).toContain('EUR');
    expect(config.PRICING_ETL_DEFAULT_REGION_AWS).toBe('us-east-1');
    expect(config.PRICING_ETL_DEFAULT_REGION_AZURE).toBe('eastus');
    expect(config.PRICING_ETL_DEFAULT_REGION_GCP).toBe('us-central1');
    expect(config.NL_PARSE_MAX_INPUT_CHARS).toBe(4000);
  });

  it('fails fast for invalid config', () => {
    expect(() =>
      validateConfig({
        ...baseConfig,
        NODE_ENV: 'local',
      }),
    ).toThrow();
  });

  it('keeps secret-shaped values out of the schema', () => {
    const config = validateConfig(baseConfig);

    expect(Object.keys(config)).not.toContain('DB_PASSWORD');
    expect(Object.keys(config)).not.toContain('LLM_API_KEY');
    expect(Object.keys(config)).not.toContain('OPENAI_API_KEY');
  });
});
