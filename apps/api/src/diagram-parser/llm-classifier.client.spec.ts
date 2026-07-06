import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema';
import { SecretsReader } from '../secrets/secrets.service';
import { OpenAiCompatibleDiagramLlmClassifierClient } from './llm-classifier.client';

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
    expect(secrets.getSecret).not.toHaveBeenCalled();
    expect(fetchClient).not.toHaveBeenCalled();
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
  });
});
