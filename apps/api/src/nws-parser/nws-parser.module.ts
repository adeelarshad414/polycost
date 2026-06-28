import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema';
import { SecretsService } from '../secrets/secrets.service';
import { FormToNWSService } from './form-to-nws.service';
import { NLParserService } from './nl-parser.service';
import { OpenAiCompatibleNwsLlmClient } from './openai-compatible-nws-llm.client';
import { STRUCTURED_LLM_CLIENT } from './nws-parser.types';

@Module({
  providers: [
    SecretsService,
    {
      provide: FormToNWSService,
      useFactory: () => new FormToNWSService(),
    },
    {
      provide: STRUCTURED_LLM_CLIENT,
      inject: [ConfigService, SecretsService],
      useFactory: (configService: ConfigService<AppConfig, true>, secretsService: SecretsService) =>
        new OpenAiCompatibleNwsLlmClient(configService, secretsService),
    },
    {
      provide: NLParserService,
      inject: [ConfigService, STRUCTURED_LLM_CLIENT],
      useFactory: (
        configService: ConfigService<AppConfig, true>,
        llmClient: OpenAiCompatibleNwsLlmClient,
      ) => new NLParserService(configService, llmClient),
    },
  ],
  exports: [FormToNWSService, NLParserService],
})
export class NwsParserModule {}
