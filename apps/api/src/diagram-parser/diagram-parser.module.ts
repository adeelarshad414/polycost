import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { DomainMetricsService } from '../observability/domain-metrics.service';
import { instrumentPool } from '../observability/instrumented-pool';
import { ConfigService } from '@nestjs/config';
import { ApiRateLimitService } from '../api/rate-limit.service';
import { AppConfig } from '../config/config.schema';
import { SecretsService } from '../secrets/secrets.service';
import { AliasDictionary } from './alias-dictionary';
import { DiagramImportRepository } from './diagram-import.repository';
import { DiagramParserController } from './diagram-parser.controller';
import { DiagramParserService } from './diagram-parser.service';
import { DiagramTempFileStore } from './diagram-temp-file.store';
import { DrawioExtractor } from './drawio.extractor';
import { FormatDetectorService } from './format-detector.service';
import {
  DIAGRAM_LLM_CLASSIFIER_CLIENT,
  OpenAiCompatibleDiagramLlmClassifierClient,
  StubLlmClassifierClient,
} from './llm-classifier.client';
import { LucidCsvExtractor } from './lucid-csv.extractor';
import { MermaidExtractor } from './mermaid.extractor';
import { NodeClassifierService } from './node-classifier.service';
import { StencilMapRegistry } from './stencil-map.registry';
import { VsdxExtractor } from './vsdx.extractor';
import { LlmClassifierClient } from './diagram-parser.types';

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
