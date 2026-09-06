import { describe, it, expect, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema.js';
import { SecretsReader } from '../secrets/secrets.service.js';
import {
  NWSParserConfigurationError,
  OpenAiCompatibleNwsLlmClient,
} from './openai-compatible-nws-llm.client.js';

const configService = (values: Partial<AppConfig>) =>
  ({
    get: jest.fn((key: keyof AppConfig) => {
      if (key === 'LLM_PARSE_ENDPOINT') {
        return values.LLM_PARSE_ENDPOINT;
      }

      if (key === 'LLM_PARSE_MODEL') {
        return values.LLM_PARSE_MODEL;
      }

      return undefined;
    }),
  }) as unknown as ConfigService<AppConfig, true>;

const secretsReader = (): SecretsReader => ({
  getSecret: jest.fn(async (_path, key) => {
    if (key === 'api_key') {
      return 'llm-provider-token';
    }

    throw new Error('missing secret');
  }),
});

describe('OpenAiCompatibleNwsLlmClient', () => {
  it('sends an OpenAI-compatible structured-output request with a Vault-backed API key', async () => {
    const fetchClient = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                draftNws: {
                  schemaVersion: '1.0',
                },
                parserConfidence: 'low',
                fieldsRequiringReview: [],
              }),
            },
          },
        ],
      }),
    })) as unknown as typeof fetch;
    const secrets = secretsReader();
    const client = new OpenAiCompatibleNwsLlmClient(
      configService({
        LLM_PARSE_ENDPOINT: 'https://llm.example.test/v1/chat/completions',
        LLM_PARSE_MODEL: 'structured-parser',
      }),
      secrets,
      fetchClient,
    );

    await expect(
      client.createStructuredOutput({
        systemPrompt: 'system',
        userPrompt: 'user',
        jsonSchema: {
          type: 'object',
        },
      }),
    ).resolves.toEqual({
      draftNws: {
        schemaVersion: '1.0',
      },
      parserConfidence: 'low',
      fieldsRequiringReview: [],
    });
    expect(secrets.getSecret).toHaveBeenCalledWith('polycost/llm', 'api_key');
    expect(fetchClient).toHaveBeenCalledWith(
      'https://llm.example.test/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer llm-provider-token',
          'content-type': 'application/json',
        }),
        body: expect.stringContaining('"response_format"'),
      }),
    );
  });

  it('fails before secret retrieval when LLM endpoint or model config is missing', async () => {
    const secrets = secretsReader();
    const client = new OpenAiCompatibleNwsLlmClient(configService({}), secrets);

    await expect(
      client.createStructuredOutput({
        systemPrompt: 'system',
        userPrompt: 'user',
        jsonSchema: {},
      }),
    ).rejects.toThrow(NWSParserConfigurationError);
    expect(secrets.getSecret).not.toHaveBeenCalled();
  });

  it('fails when the provider response is unsuccessful or malformed', async () => {
    const fetchClient = jest.fn(async () => ({
      ok: false,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    const client = new OpenAiCompatibleNwsLlmClient(
      configService({
        LLM_PARSE_ENDPOINT: 'https://llm.example.test/v1/chat/completions',
        LLM_PARSE_MODEL: 'structured-parser',
      }),
      secretsReader(),
      fetchClient,
    );

    await expect(
      client.createStructuredOutput({
        systemPrompt: 'system',
        userPrompt: 'user',
        jsonSchema: {},
      }),
    ).rejects.toThrow('NWS parser LLM request failed');
  });
});
