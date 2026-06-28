import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema';
import { SecretsReader } from '../secrets/secrets.service';
import { StructuredLlmClient, StructuredLlmRequest } from './nws-parser.types';

const LLM_SECRET_PATH = 'polycost/llm';

interface OpenAiChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export class NWSParserConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NWSParserConfigurationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

@Injectable()
export class OpenAiCompatibleNwsLlmClient implements StructuredLlmClient {
  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly secretsReader: SecretsReader,
    private readonly fetchClient: typeof fetch = fetch,
  ) {}

  async createStructuredOutput(request: StructuredLlmRequest): Promise<unknown> {
    const endpoint = this.getRequiredConfig('LLM_PARSE_ENDPOINT');
    const model = this.getRequiredConfig('LLM_PARSE_MODEL');
    const apiKey = await this.secretsReader.getSecret(LLM_SECRET_PATH, 'api_key');
    const response = await this.fetchClient(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: request.systemPrompt,
          },
          {
            role: 'user',
            content: request.userPrompt,
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'polycost_nws_parse_result',
            strict: true,
            schema: request.jsonSchema,
          },
        },
      }),
    });
    const body = (await response.json()) as OpenAiChatResponse;
    const content = body.choices?.[0]?.message?.content;

    if (!response.ok || !content) {
      throw new Error('NWS parser LLM request failed');
    }

    return JSON.parse(content) as unknown;
  }

  private getRequiredConfig(key: 'LLM_PARSE_ENDPOINT' | 'LLM_PARSE_MODEL'): string {
    const value = this.configService.get(key, { infer: true });

    if (!value) {
      throw new NWSParserConfigurationError(`${key} must be configured before NL parsing`);
    }

    return value;
  }
}
