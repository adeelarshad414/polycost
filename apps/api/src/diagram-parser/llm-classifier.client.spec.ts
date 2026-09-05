import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema.js';
import { SecretsReader } from '../secrets/secrets.service.js';
import {
  OpenAiCompatibleDiagramLlmClassifierClient,
  StubLlmClassifierClient,
} from './llm-classifier.client.js';

const configService = (values: Partial<AppConfig>) =>
  ({
    get: jest.fn((key: keyof AppConfig) => {
      if (key === 'DIAGRAM_LLM_CLASSIFIER_ENDPOINT') {
        return values.DIAGRAM_LLM_CLASSIFIER_ENDPOINT;
      }

      if (key === 'DIAGRAM_LLM_CLASSIFIER_MODEL') {
        return values.DIAGRAM_LLM_CLASSIFIER_MODEL;
      }

      return undefined;
    }),
  }) as unknown as ConfigService<AppConfig, true>;

const secretsReader = (): SecretsReader => ({
  getSecret: jest.fn(async (_path, key) => {
    if (key === 'api_key') {
      return 'diagram-classifier-token';
    }

    throw new Error('missing secret');
  }),
});

describe('OpenAiCompatibleDiagramLlmClassifierClient', () => {
  it('reports whether the production classifier path is configured without reading secrets', () => {
    const secrets = secretsReader();
    const fetchClient = jest.fn() as unknown as typeof fetch;
    const client = new OpenAiCompatibleDiagramLlmClassifierClient(
      configService({
        DIAGRAM_LLM_CLASSIFIER_ENDPOINT: 'https://llm.example.test/v1/chat/completions',
        DIAGRAM_LLM_CLASSIFIER_MODEL: 'diagram-classifier',
      }),
      secrets,
      fetchClient,
    );

    expect(client.readiness()).toEqual({
      mode: 'openai-compatible',
      configured: true,
      endpointConfigured: true,
      modelConfigured: true,
      secretPath: 'polycost/llm',
      safetyControls: expect.arrayContaining([
        'strict JSON schema response_format',
        'untrusted labels sent as JSON data',
      ]),
      caveats: expect.arrayContaining([
        expect.stringContaining('Production quality still depends on the selected model'),
        expect.stringContaining('API key is read from Vault'),
      ]),
    });
    expect(secrets.getSecret).not.toHaveBeenCalled();
    expect(fetchClient).not.toHaveBeenCalled();
  });

  it('keeps the stub classifier explicitly marked unconfigured', () => {
    const client = new StubLlmClassifierClient();

    expect(client.readiness()).toEqual({
      mode: 'stub',
      configured: false,
      endpointConfigured: false,
      modelConfigured: false,
      secretPath: 'polycost/llm',
      safetyControls: expect.arrayContaining(['schema-bound output', 'cost guard']),
      caveats: ['Tier 3 LLM classifier is disabled; unresolved nodes require manual review.'],
    });
  });

  it('classifies unresolved diagram labels through an OpenAI-compatible JSON schema request', async () => {
    const fetchClient = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                classification: {
                  serviceCategory: 'database',
                  serviceType: 'relational-database',
                  confidence: 'low',
                  reason: 'label mentions Postgres but no managed service icon was present',
                  assumedDefaults: ['100 GB database storage'],
                  quantity: 2,
                  scaleParams: {
                    engine: 'postgres',
                  },
                },
              }),
            },
          },
        ],
      }),
    })) as unknown as typeof fetch;
    const secrets = secretsReader();
    const client = new OpenAiCompatibleDiagramLlmClassifierClient(
      configService({
        DIAGRAM_LLM_CLASSIFIER_ENDPOINT: 'https://llm.example.test/v1/chat/completions',
        DIAGRAM_LLM_CLASSIFIER_MODEL: 'diagram-classifier',
      }),
      secrets,
      fetchClient,
    );

    await expect(
      client.classify({
        displayLabel: 'Postgres cluster x2',
        diagramNodeId: 'node-9',
        stencilId: 'custom.shape',
      }),
    ).resolves.toEqual({
      serviceCategory: 'database',
      serviceType: 'relational-database',
      confidence: 'low',
      reason: 'llm classifier: label mentions Postgres but no managed service icon was present',
      assumedDefaults: ['100 GB database storage'],
      serviceRequirement: {
        serviceCategory: 'database',
        serviceType: 'relational-database',
        quantity: 2,
        scaleParams: {
          engine: 'postgres',
          diagramNodeId: 'node-9',
          confidence: 'low',
          reason: 'llm classifier: label mentions Postgres but no managed service icon was present',
          assumedDefaultCount: 1,
          classifier: 'llm',
        },
      },
    });
    expect(secrets.getSecret).toHaveBeenCalledWith('polycost/llm', 'api_key');
    expect(fetchClient).toHaveBeenCalledWith(
      'https://llm.example.test/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer diagram-classifier-token',
          'content-type': 'application/json',
        }),
        body: expect.stringContaining('polycost_diagram_node_classification'),
      }),
    );
    expect(JSON.parse(String((fetchClient as jest.Mock).mock.calls[0][1].body))).toMatchObject({
      model: 'diagram-classifier',
      temperature: 0,
      messages: expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({
          role: 'user',
          content: JSON.stringify({
            displayLabel: 'Postgres cluster x2',
            stencilId: 'custom.shape',
          }),
        }),
      ]),
    });
    expect(client.lastFailureReason()).toBeUndefined();
  });

  it('does not fetch secrets when classifier endpoint or model config is missing', async () => {
    const secrets = secretsReader();
    const fetchClient = jest.fn() as unknown as typeof fetch;
    const client = new OpenAiCompatibleDiagramLlmClassifierClient(
      configService({}),
      secrets,
      fetchClient,
    );

    await expect(client.classify({ displayLabel: 'Unknown service' })).resolves.toBeUndefined();
    expect(client.lastFailureReason()).toBe('Tier 3 LLM classifier not configured');
    expect(secrets.getSecret).not.toHaveBeenCalled();
    expect(fetchClient).not.toHaveBeenCalled();
  });

  it('classifies unresolved diagram labels through one bounded batch request', async () => {
    const fetchClient = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                classifications: [
                  {
                    diagramNodeId: 'node-a',
                    classification: {
                      serviceCategory: 'integration',
                      serviceType: 'queue-or-event-bus',
                      confidence: 'low',
                      reason: 'label looks like an asynchronous handoff',
                      assumedDefaults: ['1 million messages per month'],
                      quantity: 1,
                      scaleParams: {},
                    },
                  },
                  {
                    diagramNodeId: 'node-b',
                    classification: null,
                  },
                ],
              }),
            },
          },
        ],
      }),
    })) as unknown as typeof fetch;
    const client = new OpenAiCompatibleDiagramLlmClassifierClient(
      configService({
        DIAGRAM_LLM_CLASSIFIER_ENDPOINT: 'https://llm.example.test/v1/chat/completions',
        DIAGRAM_LLM_CLASSIFIER_MODEL: 'diagram-classifier',
      }),
      secretsReader(),
      fetchClient,
    );

    await expect(
      client.classifyBatch([
        {
          displayLabel: 'Async handoff',
          diagramNodeId: 'node-a',
        },
        {
          displayLabel: 'Project note',
          diagramNodeId: 'node-b',
        },
      ]),
    ).resolves.toEqual([
      {
        serviceCategory: 'integration',
        serviceType: 'queue-or-event-bus',
        confidence: 'low',
        reason: 'llm classifier: label looks like an asynchronous handoff',
        assumedDefaults: ['1 million messages per month'],
        serviceRequirement: {
          serviceCategory: 'integration',
          serviceType: 'queue-or-event-bus',
          quantity: 1,
          scaleParams: {
            diagramNodeId: 'node-a',
            confidence: 'low',
            reason: 'llm classifier: label looks like an asynchronous handoff',
            assumedDefaultCount: 1,
            classifier: 'llm',
          },
        },
      },
      undefined,
    ]);

    expect(fetchClient).toHaveBeenCalledTimes(1);
    const requestBody = JSON.parse(String((fetchClient as jest.Mock).mock.calls[0][1].body));
    expect(requestBody.response_format.json_schema.name).toBe(
      'polycost_diagram_node_classification_batch',
    );
    expect(requestBody.messages[1].content).toBe(
      JSON.stringify({
        nodes: [
          {
            diagramNodeId: 'node-a',
            displayLabel: 'Async handoff',
            stencilId: null,
          },
          {
            diagramNodeId: 'node-b',
            displayLabel: 'Project note',
            stencilId: null,
          },
        ],
      }),
    );
    expect(client.lastFailureReason()).toBeUndefined();
  });

  it('caps direct batch requests at 20 nodes and returns same-length fallback results', async () => {
    const fetchClient = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                classifications: [],
              }),
            },
          },
        ],
      }),
    })) as unknown as typeof fetch;
    const client = new OpenAiCompatibleDiagramLlmClassifierClient(
      configService({
        DIAGRAM_LLM_CLASSIFIER_ENDPOINT: 'https://llm.example.test/v1/chat/completions',
        DIAGRAM_LLM_CLASSIFIER_MODEL: 'diagram-classifier',
      }),
      secretsReader(),
      fetchClient,
    );

    const results = await client.classifyBatch(
      Array.from({ length: 25 }, (_, index) => ({
        displayLabel: `Opaque service ${index}`,
        diagramNodeId: `node-${index}`,
      })),
    );

    expect(results).toHaveLength(25);
    expect(results.every((result) => result === undefined)).toBe(true);
    const requestBody = JSON.parse(String((fetchClient as jest.Mock).mock.calls[0][1].body));
    expect(JSON.parse(requestBody.messages[1].content).nodes).toHaveLength(20);
  });

  it('falls back to unresolved classification when provider output is malformed', async () => {
    const fetchClient = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ classification: { nope: true } }) } }],
      }),
    })) as unknown as typeof fetch;
    const client = new OpenAiCompatibleDiagramLlmClassifierClient(
      configService({
        DIAGRAM_LLM_CLASSIFIER_ENDPOINT: 'https://llm.example.test/v1/chat/completions',
        DIAGRAM_LLM_CLASSIFIER_MODEL: 'diagram-classifier',
      }),
      secretsReader(),
      fetchClient,
    );

    await expect(client.classify({ displayLabel: 'Mystery tier' })).resolves.toBeUndefined();
    expect(client.lastFailureReason()).toBe(
      'Tier 3 LLM classifier returned no usable classification',
    );
  });

  it('retries transient provider failures and keeps graceful fallback semantics', async () => {
    const fetchClient = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  classification: {
                    serviceCategory: 'integration',
                    serviceType: 'queue-or-event-bus',
                    confidence: 'moderate',
                    reason: 'label looks like a work queue',
                    assumedDefaults: [],
                    quantity: 1,
                    scaleParams: {},
                  },
                }),
              },
            },
          ],
        }),
      }) as unknown as typeof fetch;
    const client = new OpenAiCompatibleDiagramLlmClassifierClient(
      configService({
        DIAGRAM_LLM_CLASSIFIER_ENDPOINT: 'https://llm.example.test/v1/chat/completions',
        DIAGRAM_LLM_CLASSIFIER_MODEL: 'diagram-classifier',
      }),
      secretsReader(),
      fetchClient,
    );

    await expect(client.classify({ displayLabel: 'Work queue' })).resolves.toMatchObject({
      serviceCategory: 'integration',
      serviceType: 'queue-or-event-bus',
      reason: 'llm classifier: label looks like a work queue',
    });
    expect(fetchClient).toHaveBeenCalledTimes(2);
  });

  it('returns unresolved when the provider call throws or times out', async () => {
    const fetchClient = jest.fn(async () => {
      throw new Error('network timeout');
    }) as unknown as typeof fetch;
    const client = new OpenAiCompatibleDiagramLlmClassifierClient(
      configService({
        DIAGRAM_LLM_CLASSIFIER_ENDPOINT: 'https://llm.example.test/v1/chat/completions',
        DIAGRAM_LLM_CLASSIFIER_MODEL: 'diagram-classifier',
      }),
      secretsReader(),
      fetchClient,
    );

    await expect(client.classify({ displayLabel: 'Mystery service' })).resolves.toBeUndefined();
    expect(client.lastFailureReason()).toBe('Tier 3 LLM classifier request failed or timed out');
  });
});
