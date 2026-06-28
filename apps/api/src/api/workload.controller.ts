import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema';
import { NLParserService } from '../nws-parser/nl-parser.service';
import { ParsedNwsDraft } from '../nws-parser/nws-parser.types';
import { ApiValidationError } from './api-errors';
import { ComparisonApplicationService } from './comparison-application.service';
import {
  ApiRateLimitService,
  RateLimitHeaderResponse,
  requestIdentity,
  writeRateLimitHeaders,
} from './rate-limit.service';

interface RequestLike {
  ip?: string;
  headers?: Record<string, unknown>;
}

@Controller('api/v1/workload')
export class WorkloadController {
  constructor(
    private readonly nlParserService: NLParserService,
    private readonly comparisonApplicationService: ComparisonApplicationService,
    private readonly apiRateLimitService: ApiRateLimitService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  @Post('parse')
  async parse(
    @Body() body: unknown,
    @Req() request: RequestLike,
    @Res({ passthrough: true }) response?: RateLimitHeaderResponse,
  ): Promise<ParsedNwsDraft> {
    const rateLimit = this.apiRateLimitService.consume(
      'workload_parse',
      requestIdentity(request),
      this.configService.get('RATE_LIMIT_NL_PARSE_PER_MINUTE', { infer: true }),
    );
    writeRateLimitHeaders(response, rateLimit);

    if (!isRecord(body) || typeof body.naturalLanguageInput !== 'string') {
      throw new ApiValidationError('naturalLanguageInput is required', [
        {
          field: 'naturalLanguageInput',
          issue: 'must be a string',
        },
      ]);
    }

    return this.nlParserService.parse(body.naturalLanguageInput);
  }

  @Post('validate')
  async validate(@Body() body: unknown): Promise<{ valid: true }> {
    return this.comparisonApplicationService.validateNws(body);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
