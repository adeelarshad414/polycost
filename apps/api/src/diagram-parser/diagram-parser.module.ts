import { Module } from '@nestjs/common';
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
import { StubLlmClassifierClient } from './llm-classifier.client';
import { LucidCsvExtractor } from './lucid-csv.extractor';
import { MermaidExtractor } from './mermaid.extractor';
import { NodeClassifierService } from './node-classifier.service';
import { StencilMapRegistry } from './stencil-map.registry';
import { VsdxExtractor } from './vsdx.extractor';

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
      provide: NodeClassifierService,
      inject: [StencilMapRegistry, AliasDictionary, StubLlmClassifierClient],
      useFactory: (
        stencilMapRegistry: StencilMapRegistry,
        aliasDictionary: AliasDictionary,
        llmClassifierClient: StubLlmClassifierClient,
      ) => new NodeClassifierService(stencilMapRegistry, aliasDictionary, llmClassifierClient),
    },
    DiagramParserService,
    DiagramTempFileStore,
    {
      provide: DiagramImportRepository,
      inject: [ConfigService, SecretsService],
      useFactory: (configService: ConfigService<AppConfig, true>, secretsService: SecretsService) =>
        new DiagramImportRepository(configService, secretsService),
    },
    {
      provide: ApiRateLimitService,
      useFactory: () => new ApiRateLimitService(),
    },
  ],
  exports: [DiagramParserService],
})
export class DiagramParserModule {}
