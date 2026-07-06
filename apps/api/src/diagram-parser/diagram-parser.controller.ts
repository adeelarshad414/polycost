import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema';
import {
  ApiRateLimitService,
  RateLimitHeaderResponse,
  requestIdentity,
  writeRateLimitHeaders,
} from '../api/rate-limit.service';
import { DiagramImportRepository } from './diagram-import.repository';
import { DiagramParseRequest, DiagramParseResult } from './diagram-parser.types';
import { DiagramParserService } from './diagram-parser.service';
import { DiagramTempFileStore } from './diagram-temp-file.store';

interface RequestLike {
  ip?: string;
  headers?: Record<string, unknown>;
}

@Controller('api/v1/parse')
export class DiagramParserController {
  constructor(
    private readonly diagramParserService: DiagramParserService,
    private readonly diagramImportRepository: DiagramImportRepository,
    private readonly diagramTempFileStore: DiagramTempFileStore,
    private readonly apiRateLimitService: ApiRateLimitService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  @Post('diagram')
  async parseDiagram(
    @Body() body: DiagramParseRequest,
    @Req() request: RequestLike,
    @Res({ passthrough: true }) response?: RateLimitHeaderResponse,
  ): Promise<DiagramParseResult> {
    const rateLimit = this.apiRateLimitService.consume(
      'diagram_parse',
      requestIdentity(request),
      this.configService.get('RATE_LIMIT_DIAGRAM_PARSE_PER_MINUTE', { infer: true }),
    );
    writeRateLimitHeaders(response, rateLimit);

    const decoded = this.diagramParserService.decode(body);
    const parsed = await this.diagramParserService.parse({
      ...body,
      fileName: decoded.fileName,
      mimeType: decoded.mimeType,
    });
    let persisted = false;
    const storedFile = await this.diagramTempFileStore.store(decoded, parsed.importId);

    try {
      persisted = await this.diagramImportRepository.save({
        importId: parsed.importId,
        format: decoded.detectedFormat,
        fileName: decoded.fileName,
        mimeType: decoded.mimeType,
        sizeBytes: decoded.sizeBytes,
        sha256: decoded.sha256,
        tempFileRef: storedFile.fileRef,
        expiresAt: storedFile.expiresAt,
        parserConfidence: parsed.parserConfidence,
        unresolvedCount: parsed.review.unresolvedClassifications.length,
        ignoredCount: parsed.review.ignoredNodes.length,
        graph: parsed.graph,
        draftNws: parsed.draftNws,
      });
    } catch {
      persisted = false;
    }

    return {
      ...parsed,
      source: {
        format: decoded.detectedFormat,
        fileName: decoded.fileName,
        mimeType: decoded.mimeType,
        sizeBytes: decoded.sizeBytes,
        sha256: decoded.sha256,
        parsedAt: parsed.draftNws.metadata.createdAt,
        persisted,
        tempFileStored: true,
        expiresAt: storedFile.expiresAt,
      },
    };
  }
}
