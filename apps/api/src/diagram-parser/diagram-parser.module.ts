import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { DomainMetricsService } from '../observability/domain-metrics.service.js';
import { instrumentPool } from '../observability/instrumented-pool.js';
import { ConfigService } from '@nestjs/config';
import { ApiRateLimitService } from '../api/rate-limit.service.js';
import { AppConfig } from '../config/config.schema.js';
import { SecretsService } from '../secrets/secrets.service.js';
import { AliasDictionary } from './alias-dictionary.js';
import { DiagramImportRepository } from './diagram-import.repository.js';
import { DiagramParserController } from './diagram-parser.controller.js';
import { DiagramParserService } from './diagram-parser.service.js';
import { DiagramTempFileStore } from './diagram-temp-file.store.js';
import { DrawioExtractor } from './drawio.extractor.js';
import { FormatDetectorService } from './format-detector.service.js';
import {
  DIAGRAM_LLM_CLASSIFIER_CLIENT,
  OpenAiCompatibleDiagramLlmClassifierClient,
  StubLlmClassifierClient,
} from './llm-classifier.client.js';
import { LucidCsvExtractor } from './lucid-csv.extractor.js';
import { MermaidExtractor } from './mermaid.extractor.js';
import { NodeClassifierService } from './node-classifier.service.js';
import { StencilMapRegistry } from './stencil-map.registry.js';
import { VsdxExtractor } from './vsdx.extractor.js';
import { LlmClassifierClient } from './diagram-parser.types.js';

@Module({
  controllers: [DiagramParserController],
  providers: [
    SecretsService,
    FormatDetectorService,
    MermaidExtractor,
    DrawioExtractor,
    LucidCsvExtractor,
    VsdxExtractor,
    AliasDictionary,
    StencilMapRegistry,
    StubLlmClassifierClient,
    {
      provide: DIAGRAM_LLM_CLASSIFIER_CLIENT,
      inject: [ConfigService, SecretsService],
      useFactory: (
        configService: ConfigService<AppConfig, true>,
        secretsService: SecretsService,
      ): LlmClassifierClient => {
        const endpoint = configService.get('DIAGRAM_LLM_CLASSIFIER_ENDPOINT', { infer: true });
        const model = configService.get('DIAGRAM_LLM_CLASSIFIER_MODEL', { infer: true });

        return endpoint && model
          ? new OpenAiCompatibleDiagramLlmClassifierClient(configService, secretsService)
          : new StubLlmClassifierClient();
      },
    },
    {
      provide: NodeClassifierService,
      inject: [StencilMapRegistry, AliasDictionary, DIAGRAM_LLM_CLASSIFIER_CLIENT],
      useFactory: (
        stencilMapRegistry: StencilMapRegistry,
        aliasDictionary: AliasDictionary,
        llmClassifierClient: LlmClassifierClient,
      ) => new NodeClassifierService(stencilMapRegistry, aliasDictionary, llmClassifierClient),
    },
    DiagramParserService,
    DiagramTempFileStore,
    {
      provide: DiagramImportRepository,
      inject: [ConfigService, SecretsService, DomainMetricsService],
      useFactory: (
        configService: ConfigService<AppConfig, true>,
        secretsService: SecretsService,
        domainMetrics: DomainMetricsService,
      ) =>
        new DiagramImportRepository(configService, secretsService, (config) =>
          instrumentPool(new Pool(config), domainMetrics, 'diagram_import'),
        ),
    },
    {
      provide: ApiRateLimitService,
      useFactory: () => new ApiRateLimitService(),
    },
  ],
  exports: [DiagramParserService],
})
export class DiagramParserModule {}
