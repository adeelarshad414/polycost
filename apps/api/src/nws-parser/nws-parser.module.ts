import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema.js';
import { SecretsService } from '../secrets/secrets.service.js';
import { FormToNWSService } from './form-to-nws.service.js';
import { NLParserService } from './nl-parser.service.js';
import { OpenAiCompatibleNwsLlmClient } from './openai-compatible-nws-llm.client.js';
import { STRUCTURED_LLM_CLIENT } from './nws-parser.types.js';
import {
  GuidedFormRequirementParser,
  NaturalLanguageRequirementParser,
  REQUIREMENT_PARSERS,
} from './requirement-parser.service.js';

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
    NaturalLanguageRequirementParser,
    GuidedFormRequirementParser,
    {
      provide: REQUIREMENT_PARSERS,
      inject: [NaturalLanguageRequirementParser, GuidedFormRequirementParser],
      useFactory: (
        naturalLanguageParser: NaturalLanguageRequirementParser,
        guidedFormParser: GuidedFormRequirementParser,
      ) => [naturalLanguageParser, guidedFormParser],
    },
  ],
  exports: [
    FormToNWSService,
    NLParserService,
    NaturalLanguageRequirementParser,
    GuidedFormRequirementParser,
    REQUIREMENT_PARSERS,
  ],
})
export class NwsParserModule {}
