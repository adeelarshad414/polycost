export const NWS_PARSE_RESULT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['draftNws', 'parserConfidence', 'fieldsRequiringReview'],
  properties: {
    parserConfidence: {
      type: 'string',
      enum: ['high', 'medium', 'low'],
    },
    fieldsRequiringReview: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    draftNws: {
      type: 'object',
      additionalProperties: false,
      required: [
        'schemaVersion',
        'metadata',
        'workload',
        'compute',
        'storage',
        'database',
        'network',
        'availability',
      ],
      properties: {
        schemaVersion: {
          type: 'string',
          enum: ['1.0'],
        },
        metadata: {
          type: 'object',
          additionalProperties: false,
          required: ['sourceType', 'createdAt'],
          properties: {
            sourceType: {
              type: 'string',
              enum: ['natural_language'],
            },
            rawInput: {
              type: 'string',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        workload: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'region'],
          properties: {
            name: {
              type: 'string',
            },
            type: {
              type: 'string',
              enum: [
                'web_app',
                'api_backend',
                'static_site',
                'batch_processing',
                'data_pipeline',
                'ml_workload',
                'other',
              ],
            },
            expectedUsers: {
              type: 'object',
              additionalProperties: false,
              properties: {
                dailyActiveUsers: {
                  type: 'integer',
                  minimum: 0,
                },
                peakConcurrentUsers: {
                  type: 'integer',
                  minimum: 0,
                },
              },
            },
            region: {
              type: 'object',
              additionalProperties: false,
              required: ['isDefault'],
              properties: {
                preference: {
                  type: 'string',
                },
                isDefault: {
                  type: 'boolean',
                },
              },
            },
          },
        },
        compute: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['role', 'scalingType'],
            properties: {
              role: {
                type: 'string',
              },
              instanceFamily: {
                type: 'string',
                enum: [
                  'general-purpose',
                  'compute-optimized',
                  'memory-optimized',
                  'storage-optimized',
                  'accelerated-computing',
                ],
              },
              processorArchitecture: {
                type: 'string',
                enum: ['x86_64', 'arm64', 'gpu'],
              },
              tenancy: {
                type: 'string',
                enum: ['shared', 'dedicated-host', 'sole-tenant'],
              },
              vcpu: {
                type: 'number',
                exclusiveMinimum: 0,
              },
              memoryGb: {
                type: 'number',
                exclusiveMinimum: 0,
              },
              instanceCount: {
                type: 'integer',
                minimum: 1,
              },
              scalingType: {
                type: 'string',
                enum: ['fixed', 'autoscaling'],
              },
              autoscalingRange: {
                type: 'object',
                additionalProperties: false,
                required: ['min', 'max'],
                properties: {
                  min: {
                    type: 'integer',
                    minimum: 0,
                  },
                  max: {
                    type: 'integer',
                    minimum: 0,
                  },
                },
              },
            },
          },
        },
        storage: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['role', 'type', 'sizeGb'],
            properties: {
              role: {
                type: 'string',
              },
              type: {
                type: 'string',
                enum: ['object', 'block', 'file'],
              },
              sizeGb: {
                type: 'number',
                exclusiveMinimum: 0,
              },
              accessPattern: {
                type: 'string',
                enum: ['frequent', 'infrequent', 'archive'],
              },
              storageClass: {
                type: 'string',
                enum: [
                  'standard',
                  'hot',
                  'cool',
                  'cold',
                  'nearline',
                  'coldline',
                  'intelligent-tiering',
                  'infrequent-access',
                  'one-zone-infrequent-access',
                  'archive-instant',
                  'archive',
                  'deep-archive',
                  'premium',
                  'ultra',
                ],
              },
              monthlyPutRequestsThousand: {
                type: 'number',
                minimum: 0,
              },
              monthlyGetRequestsThousand: {
                type: 'number',
                minimum: 0,
              },
              monthlyDeleteRequestsThousand: {
                type: 'number',
                minimum: 0,
              },
              monthlyListRequestsThousand: {
                type: 'number',
                minimum: 0,
              },
              monthlyRetrievalGb: {
                type: 'number',
                minimum: 0,
              },
              replication: {
                type: 'string',
                enum: ['none', 'same-region', 'cross-region'],
              },
              lifecycleTransitionsThousand: {
                type: 'number',
                minimum: 0,
              },
              snapshotSizeGb: {
                type: 'number',
                minimum: 0,
              },
              snapshotRetentionDays: {
                type: 'integer',
                minimum: 0,
              },
              provisionedIops: {
                type: 'integer',
                minimum: 0,
              },
              provisionedThroughputMbps: {
                type: 'number',
                minimum: 0,
              },
            },
          },
        },
        database: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['role', 'engine', 'highAvailability'],
            properties: {
              role: {
                type: 'string',
              },
              engine: {
                type: 'string',
                enum: [
                  'postgres',
                  'mysql',
                  'mongodb',
                  'redis',
                  'generic_relational',
                  'generic_nosql',
                ],
              },
              sizeGb: {
                type: 'number',
                exclusiveMinimum: 0,
              },
              highAvailability: {
                type: 'boolean',
              },
              managedServicePreference: {
                type: 'string',
              },
              backupStorageGb: {
                type: 'number',
                minimum: 0,
              },
              backupRetentionDays: {
                type: 'integer',
                minimum: 0,
              },
              provisionedIops: {
                type: 'integer',
                minimum: 0,
              },
              readReplicaCount: {
                type: 'integer',
                minimum: 0,
              },
              crossRegionReplicaTransferGb: {
                type: 'number',
                minimum: 0,
              },
              nosqlReadRequestUnitsMillion: {
                type: 'number',
                minimum: 0,
              },
              nosqlWriteRequestUnitsMillion: {
                type: 'number',
                minimum: 0,
              },
              ruPerSecond: {
                type: 'integer',
                minimum: 0,
              },
              queryDataTb: {
                type: 'number',
                minimum: 0,
              },
              cacheReplicaCount: {
                type: 'integer',
                minimum: 0,
              },
              storageGrowthGbPerMonth: {
                type: 'number',
                minimum: 0,
              },
            },
          },
        },
        network: {
          type: 'object',
          additionalProperties: false,
          required: ['cdn', 'loadBalancer'],
          properties: {
            estimatedMonthlyEgressGb: {
              type: 'number',
              minimum: 0,
            },
            cdn: {
              type: 'boolean',
            },
            loadBalancer: {
              type: 'boolean',
            },
          },
        },
        availability: {
          type: 'object',
          additionalProperties: false,
          required: ['multiAz', 'multiRegion'],
          properties: {
            multiAz: {
              type: 'boolean',
            },
            multiRegion: {
              type: 'boolean',
            },
            slaTarget: {
              type: 'string',
            },
          },
        },
        serviceRequirements: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['serviceCategory', 'serviceType', 'quantity'],
            properties: {
              serviceCategory: {
                type: 'string',
                enum: [
                  'compute',
                  'containers',
                  'application',
                  'storage',
                  'database',
                  'analytics',
                  'ai',
                  'integration',
                  'networking',
                  'security',
                  'operations',
                  'devops',
                  'migration',
                  'edge',
                  'business',
                ],
              },
              serviceType: {
                type: 'string',
              },
              instanceType: {
                type: 'string',
              },
              tier: {
                type: 'string',
              },
              region: {
                type: 'string',
              },
              az: {
                type: 'string',
              },
              quantity: {
                type: 'integer',
                minimum: 1,
              },
              scaleParams: {
                type: 'object',
                additionalProperties: {
                  anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
                },
              },
            },
          },
        },
        sourceTraceability: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['nwsPath', 'sourceRef'],
            properties: {
              nwsPath: {
                type: 'string',
              },
              sourceRef: {
                type: 'string',
              },
            },
          },
        },
      },
    },
  },
} as const;
