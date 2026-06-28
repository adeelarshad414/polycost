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
