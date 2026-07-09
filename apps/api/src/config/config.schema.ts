import { z } from 'zod';

const envBoolean = (defaultValue: boolean) =>
  z
    .preprocess((value) => {
      if (typeof value !== 'string') {
        return value;
      }

      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }

      return value;
    }, z.boolean())
    .default(defaultValue);

const optionalUrl = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().url().optional(),
);

const optionalNonEmptyString = (minLength = 1) =>
  z.preprocess((value) => (value === '' ? undefined : value), z.string().min(minLength).optional());

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
    USE_MOCK_PROVIDERS: envBoolean(true),
    PRICING_ETL_RUN_ON_BOOT: envBoolean(true),
    RATE_LIMIT_COMPARISON_PER_MINUTE: z.coerce.number().int().positive().default(30),
    RATE_LIMIT_EXPORT_PER_MINUTE: z.coerce.number().int().positive().default(10),
    RATE_LIMIT_SHARE_LINK_PER_MINUTE: z.coerce.number().int().positive().default(20),
    RATE_LIMIT_PUBLIC_READ_PER_MINUTE: z.coerce.number().int().positive().default(60),
    RATE_LIMIT_PUBLIC_WRITE_PER_MINUTE: z.coerce.number().int().positive().default(30),
    RATE_LIMIT_AUTH_PER_MINUTE: z.coerce.number().int().positive().default(10),
    RATE_LIMIT_NL_PARSE_PER_MINUTE: z.coerce.number().default(10),
    RATE_LIMIT_DIAGRAM_PARSE_PER_MINUTE: z.coerce.number().int().positive().default(10),
    RATE_LIMIT_LIVE_REFRESH_PER_MINUTE: z.coerce.number().default(5),
    AUTH_SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
    AUTH_PASSWORD_MIN_LENGTH: z.coerce.number().int().min(8).default(12),
    AUTH_MAX_FAILED_LOGIN_ATTEMPTS: z.coerce.number().int().min(3).default(5),
    AUTH_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
    AUTH_LOCAL_REGISTRATION_ENABLED: envBoolean(true),
    AUTH_PUBLIC_BASE_URL: z.string().url().default('http://localhost:3001'),
    AUTH_SSO_STATE_SECRET: z.string().min(16).default('CHANGE_ME_DEV_ONLY_SSO_STATE_SECRET'),
    AUTH_INVITE_DELIVERY_MODE: z.enum(['panel', 'webhook']).default('panel'),
    AUTH_INVITE_DELIVERY_WEBHOOK_URL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().url().optional(),
    ),
    AUTH_INVITE_DELIVERY_WEBHOOK_SECRET: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(16).optional(),
    ),
    AUTH_INVITE_EMAIL_FROM: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(3).optional(),
    ),
    AUTH_AUDIT_EXPORT_MODE: z.enum(['disabled', 'webhook']).default('disabled'),
    AUTH_AUDIT_EXPORT_WEBHOOK_URL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().url().optional(),
    ),
    AUTH_AUDIT_EXPORT_WEBHOOK_SECRET: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(16).optional(),
    ),
    AUTH_AUDIT_EXPORT_SCHEDULE_CRON: z.string().default('*/5 * * * *'),
    AUTH_AUDIT_EXPORT_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(50),
    AUTH_AUDIT_EXPORT_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
    INVOICE_ARTIFACT_STORAGE_BACKEND: z
      .enum(['database-bytea', 'aws-s3', 'azure-blob', 'gcp-gcs'])
      .default('database-bytea'),
    INVOICE_ARTIFACT_OBJECT_STORE_NAME: optionalNonEmptyString(3),
    INVOICE_ARTIFACT_OBJECT_STORE_REGION: optionalNonEmptyString(2),
    INVOICE_ARTIFACT_OBJECT_STORE_PREFIX: z.string().min(1).default('invoice-artifacts'),
    INVOICE_ARTIFACT_KMS_KEY_REFERENCE: optionalNonEmptyString(3),
    INVOICE_ARTIFACT_MALWARE_SCANNER_MODE: z
      .enum(['eicar-signature-only', 'http-webhook'])
      .default('eicar-signature-only'),
    INVOICE_ARTIFACT_MALWARE_SCANNER_URL: optionalUrl,
    INVOICE_ARTIFACT_MALWARE_SCANNER_SECRET: optionalNonEmptyString(16),
    INVOICE_ARTIFACT_RETENTION_ENFORCEMENT_MODE: z
      .enum(['report-only', 'delete-expired'])
      .default('report-only'),
    INVOICE_EVIDENCE_RECEIPT_MODE: z
      .enum(['metadata-only', 'local-hmac', 'external-webhook'])
      .default('metadata-only'),
    INVOICE_EVIDENCE_RECEIPT_SIGNING_KEY_REFERENCE: optionalNonEmptyString(3),
    INVOICE_EVIDENCE_RECEIPT_SIGNING_SECRET: optionalNonEmptyString(32),
    INVOICE_EVIDENCE_NOTARY_WEBHOOK_URL: optionalUrl,
    INVOICE_EVIDENCE_WORM_RETENTION_MODE: z
      .enum(['not-configured', 'provider-object-lock', 'external-worm-receiver'])
      .default('not-configured'),
    AUTH_OIDC_ISSUER_URL: z.string().url().optional(),
    AUTH_OIDC_CLIENT_ID: z.string().min(1).optional(),
    AUTH_SAML_ENTITY_ID: z.string().min(1).optional(),
    AUTH_SAML_SSO_URL: z.string().url().optional(),
    NL_PARSE_MAX_INPUT_CHARS: z.coerce.number().int().positive().default(4000),
    LLM_PARSE_ENDPOINT: z.string().url().optional(),
    LLM_PARSE_MODEL: z.string().min(1).optional(),
    DIAGRAM_TEMP_DIR: z.string().min(1).default('/tmp/polycost-diagram-imports'),
    DIAGRAM_LLM_CLASSIFIER_ENDPOINT: z.string().url().optional(),
    DIAGRAM_LLM_CLASSIFIER_MODEL: z.string().min(1).optional(),
    VAULT_ADDR: z.string().url(),
    VAULT_TOKEN_FILE: z.string().min(1).optional(),
    VAULT_NAMESPACE: z.string().optional(),
    CORS_ALLOWED_ORIGINS: z
      .string()
      .default(
        'http://localhost:3000,http://localhost:3002,http://127.0.0.1:3000,http://127.0.0.1:3002',
      ),
    FEATURE_LIVE_PRICING_REFRESH_ENABLED: envBoolean(true),
    FEATURE_RESERVED_PRICING: envBoolean(true),
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

    if (config.NODE_ENV === 'production' || config.NODE_ENV === 'staging') {
      if (config.AUTH_INVITE_DELIVERY_MODE !== 'webhook') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['AUTH_INVITE_DELIVERY_MODE'],
          message: 'Staging and production invite delivery must use the webhook provider.',
        });
      }

      if (config.AUTH_AUDIT_EXPORT_MODE !== 'webhook') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['AUTH_AUDIT_EXPORT_MODE'],
          message: 'Staging and production audit export must use the webhook provider.',
        });
      }

      for (const [key, value] of Object.entries(config)) {
        if (typeof value === 'string' && isDummyValue(value)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: 'CHANGE_ME_DEV_ONLY and dummy values are not allowed outside development.',
          });
        }
      }
    }

    if (config.AUTH_INVITE_DELIVERY_MODE === 'webhook') {
      if (!config.AUTH_INVITE_DELIVERY_WEBHOOK_URL) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['AUTH_INVITE_DELIVERY_WEBHOOK_URL'],
          message: 'AUTH_INVITE_DELIVERY_WEBHOOK_URL is required for webhook invite delivery.',
        });
      }

      if (!config.AUTH_INVITE_DELIVERY_WEBHOOK_SECRET) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['AUTH_INVITE_DELIVERY_WEBHOOK_SECRET'],
          message: 'AUTH_INVITE_DELIVERY_WEBHOOK_SECRET is required for webhook invite delivery.',
        });
      }

      if (
        (config.NODE_ENV === 'production' || config.NODE_ENV === 'staging') &&
        config.AUTH_INVITE_DELIVERY_WEBHOOK_URL &&
        !config.AUTH_INVITE_DELIVERY_WEBHOOK_URL.startsWith('https://')
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['AUTH_INVITE_DELIVERY_WEBHOOK_URL'],
          message: 'Invite delivery webhook URL must use HTTPS outside development.',
        });
      }
    }

    if (config.AUTH_AUDIT_EXPORT_MODE === 'webhook') {
      if (!config.AUTH_AUDIT_EXPORT_WEBHOOK_URL) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['AUTH_AUDIT_EXPORT_WEBHOOK_URL'],
          message: 'AUTH_AUDIT_EXPORT_WEBHOOK_URL is required for audit export webhooks.',
        });
      }

      if (!config.AUTH_AUDIT_EXPORT_WEBHOOK_SECRET) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['AUTH_AUDIT_EXPORT_WEBHOOK_SECRET'],
          message: 'AUTH_AUDIT_EXPORT_WEBHOOK_SECRET is required for audit export webhooks.',
        });
      }

      if (
        (config.NODE_ENV === 'production' || config.NODE_ENV === 'staging') &&
        config.AUTH_AUDIT_EXPORT_WEBHOOK_URL &&
        !config.AUTH_AUDIT_EXPORT_WEBHOOK_URL.startsWith('https://')
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['AUTH_AUDIT_EXPORT_WEBHOOK_URL'],
          message: 'Audit export webhook URL must use HTTPS outside development.',
        });
      }
    }

    if (config.INVOICE_ARTIFACT_STORAGE_BACKEND !== 'database-bytea') {
      if (!config.INVOICE_ARTIFACT_OBJECT_STORE_NAME) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['INVOICE_ARTIFACT_OBJECT_STORE_NAME'],
          message:
            'INVOICE_ARTIFACT_OBJECT_STORE_NAME is required for external invoice artifact storage.',
        });
      }

      if (!config.INVOICE_ARTIFACT_OBJECT_STORE_REGION) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['INVOICE_ARTIFACT_OBJECT_STORE_REGION'],
          message:
            'INVOICE_ARTIFACT_OBJECT_STORE_REGION is required for external invoice artifact storage.',
        });
      }
    }

    if (config.INVOICE_ARTIFACT_MALWARE_SCANNER_MODE === 'http-webhook') {
      if (!config.INVOICE_ARTIFACT_MALWARE_SCANNER_URL) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['INVOICE_ARTIFACT_MALWARE_SCANNER_URL'],
          message:
            'INVOICE_ARTIFACT_MALWARE_SCANNER_URL is required for webhook artifact scanning.',
        });
      }

      if (!config.INVOICE_ARTIFACT_MALWARE_SCANNER_SECRET) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['INVOICE_ARTIFACT_MALWARE_SCANNER_SECRET'],
          message:
            'INVOICE_ARTIFACT_MALWARE_SCANNER_SECRET is required for webhook artifact scanning.',
        });
      }

      if (
        (config.NODE_ENV === 'production' || config.NODE_ENV === 'staging') &&
        config.INVOICE_ARTIFACT_MALWARE_SCANNER_URL &&
        !config.INVOICE_ARTIFACT_MALWARE_SCANNER_URL.startsWith('https://')
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['INVOICE_ARTIFACT_MALWARE_SCANNER_URL'],
          message: 'Invoice artifact scanner webhook URL must use HTTPS outside development.',
        });
      }
    }

    if (config.INVOICE_EVIDENCE_RECEIPT_MODE !== 'metadata-only') {
      if (!config.INVOICE_EVIDENCE_RECEIPT_SIGNING_KEY_REFERENCE) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['INVOICE_EVIDENCE_RECEIPT_SIGNING_KEY_REFERENCE'],
          message:
            'INVOICE_EVIDENCE_RECEIPT_SIGNING_KEY_REFERENCE is required for signed invoice evidence receipts.',
        });
      }

      if (!config.INVOICE_EVIDENCE_RECEIPT_SIGNING_SECRET) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['INVOICE_EVIDENCE_RECEIPT_SIGNING_SECRET'],
          message:
            'INVOICE_EVIDENCE_RECEIPT_SIGNING_SECRET is required for signed invoice evidence receipts.',
        });
      }
    }

    if (config.INVOICE_EVIDENCE_RECEIPT_MODE === 'external-webhook') {
      if (!config.INVOICE_EVIDENCE_NOTARY_WEBHOOK_URL) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['INVOICE_EVIDENCE_NOTARY_WEBHOOK_URL'],
          message:
            'INVOICE_EVIDENCE_NOTARY_WEBHOOK_URL is required for external invoice evidence receipt handoff.',
        });
      }

      if (
        (config.NODE_ENV === 'production' || config.NODE_ENV === 'staging') &&
        config.INVOICE_EVIDENCE_NOTARY_WEBHOOK_URL &&
        !config.INVOICE_EVIDENCE_NOTARY_WEBHOOK_URL.startsWith('https://')
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['INVOICE_EVIDENCE_NOTARY_WEBHOOK_URL'],
          message: 'Invoice evidence notary webhook URL must use HTTPS outside development.',
        });
      }
    }

    if (config.NODE_ENV === 'production' || config.NODE_ENV === 'staging') {
      if (config.INVOICE_ARTIFACT_STORAGE_BACKEND === 'database-bytea') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['INVOICE_ARTIFACT_STORAGE_BACKEND'],
          message:
            'Staging and production invoice artifact storage must use external object storage.',
        });
      }

      if (!config.INVOICE_ARTIFACT_KMS_KEY_REFERENCE) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['INVOICE_ARTIFACT_KMS_KEY_REFERENCE'],
          message:
            'INVOICE_ARTIFACT_KMS_KEY_REFERENCE is required for staging and production invoice artifacts.',
        });
      }

      if (config.INVOICE_ARTIFACT_MALWARE_SCANNER_MODE !== 'http-webhook') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['INVOICE_ARTIFACT_MALWARE_SCANNER_MODE'],
          message: 'Staging and production invoice artifact scanning must use the webhook scanner.',
        });
      }

      if (config.INVOICE_ARTIFACT_RETENTION_ENFORCEMENT_MODE !== 'delete-expired') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['INVOICE_ARTIFACT_RETENTION_ENFORCEMENT_MODE'],
          message:
            'Staging and production invoice artifact retention enforcement must delete expired non-held artifacts.',
        });
      }

      if (config.INVOICE_EVIDENCE_RECEIPT_MODE === 'metadata-only') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['INVOICE_EVIDENCE_RECEIPT_MODE'],
          message: 'Staging and production invoice evidence packets must use signed receipts.',
        });
      }

      if (config.INVOICE_EVIDENCE_WORM_RETENTION_MODE === 'not-configured') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['INVOICE_EVIDENCE_WORM_RETENTION_MODE'],
          message:
            'Staging and production invoice evidence packets must declare provider object-lock or external WORM retention.',
        });
      }
    }

    if (
      (config.NODE_ENV === 'production' || config.NODE_ENV === 'staging') &&
      !config.USE_MOCK_PROVIDERS &&
      !config.VAULT_TOKEN_FILE
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['VAULT_TOKEN_FILE'],
        message:
          'VAULT_TOKEN_FILE is required when real provider pricing is enabled outside development.',
      });
    }
  });

export type AppConfig = z.infer<typeof configSchema>;

export function validateConfig(env: Record<string, unknown>): AppConfig {
  return configSchema.parse(env);
}

function isDummyValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === 'change_me_dev_only' ||
    normalized === 'dummy' ||
    normalized === 'example' ||
    normalized.includes('change_me')
  );
}
