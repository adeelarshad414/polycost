import { z } from 'zod';

export const configSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']),
    PORT: z.coerce.number().default(3000),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    DB_HOST: z.string().min(1),
    DB_PORT: z.coerce.number().default(5432),
    DB_NAME: z.string().min(1),
    REDIS_HOST: z.string().min(1),
    REDIS_PORT: z.coerce.number().default(6379),
    PRICING_ETL_SCHEDULE_CRON: z.string().default('0 2 * * *'),
    CURRENCY_SYNC_SCHEDULE_CRON: z.string().default('0 * * * *'),
    ALERT_EVALUATOR_SCHEDULE_CRON: z.string().default('*/15 * * * *'),
    SHARE_LINK_CLEANUP_SCHEDULE_CRON: z.string().default('0 3 * * *'),
    PRICING_SYNC_ALERT_WEBHOOK_URL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().url().optional(),
    ),
    EXCHANGE_RATE_API_URL: z.string().url().default('https://api.frankfurter.app/latest'),
    EXCHANGE_RATE_TARGET_CURRENCIES: z.string().default('EUR,GBP,CAD,AUD,PKR,INR,JPY'),
    PRICING_ETL_DEFAULT_REGION_AWS: z.string().default('us-east-1'),
    PRICING_ETL_DEFAULT_REGION_AZURE: z.string().default('eastus'),
    PRICING_ETL_DEFAULT_REGION_GCP: z.string().default('us-central1'),
    RATE_LIMIT_COMPARISON_PER_MINUTE: z.coerce.number().int().positive().default(30),
    RATE_LIMIT_EXPORT_PER_MINUTE: z.coerce.number().int().positive().default(10),
    RATE_LIMIT_SHARE_LINK_PER_MINUTE: z.coerce.number().int().positive().default(20),
    RATE_LIMIT_PUBLIC_READ_PER_MINUTE: z.coerce.number().int().positive().default(60),
    RATE_LIMIT_PUBLIC_WRITE_PER_MINUTE: z.coerce.number().int().positive().default(30),
    RATE_LIMIT_NL_PARSE_PER_MINUTE: z.coerce.number().default(10),
    RATE_LIMIT_LIVE_REFRESH_PER_MINUTE: z.coerce.number().default(5),
    NL_PARSE_MAX_INPUT_CHARS: z.coerce.number().int().positive().default(4000),
    LLM_PARSE_ENDPOINT: z.string().url().optional(),
    LLM_PARSE_MODEL: z.string().min(1).optional(),
    VAULT_ADDR: z.string().url(),
    VAULT_TOKEN_FILE: z.string().min(1).optional(),
    VAULT_NAMESPACE: z.string().optional(),
    CORS_ALLOWED_ORIGINS: z
      .string()
      .default(
        'http://localhost:3000,http://localhost:3002,http://127.0.0.1:3000,http://127.0.0.1:3002',
      ),
    FEATURE_LIVE_PRICING_REFRESH_ENABLED: z.coerce.boolean().default(true),
    FEATURE_RESERVED_PRICING: z.coerce.boolean().default(true),
  })
  .superRefine((config, context) => {
    const origins = config.CORS_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim());

    if (
      (config.NODE_ENV === 'production' || config.NODE_ENV === 'staging') &&
      origins.includes('*')
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_ALLOWED_ORIGINS'],
        message: 'Wildcard CORS origins are not allowed in staging or production.',
      });
    }
  });

export type AppConfig = z.infer<typeof configSchema>;

export function validateConfig(env: Record<string, unknown>): AppConfig {
  return configSchema.parse(env);
}
