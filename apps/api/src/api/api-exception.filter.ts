import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ComparisonUnavailableError } from '../comparison/comparison-orchestrator.service';
import { NWSMigrationError, NWSValidationError } from '../nws/nws-validator';
import { NWSParseInputError } from '../nws-parser/nl-parser.service';
import {
  ApiForbiddenError,
  ApiNotFoundError,
  ApiUnauthorizedError,
  ApiValidationError,
  LiveRefreshUnavailableError,
  RateLimitExceededError,
} from './api-errors';

interface ErrorResponse {
  status(statusCode: number): {
    send(body: unknown): void;
  };
  header?(name: string, value: string): void;
}

@Catch()
@Injectable()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<ErrorResponse>();
    const mapped = mapException(exception);

    if (mapped.retryAfterSeconds !== undefined && response.header) {
      response.header('Retry-After', mapped.retryAfterSeconds.toString());
    }

    if (mapped.code === 'INTERNAL_ERROR') {
      this.logger.error({
        event: 'api_unhandled_exception',
        code: mapped.code,
        message: mapped.message,
        exception: serializeExceptionForLog(exception),
      });
    }

    response.status(mapped.statusCode).send({
      error: {
        code: mapped.code,
        message: mapped.message,
        ...(mapped.details.length > 0 ? { details: mapped.details } : {}),
      },
    });
  }
}

function mapException(exception: unknown): {
  statusCode: number;
  code: string;
  message: string;
  details: Array<{ field?: string; issue: string }>;
  retryAfterSeconds?: number;
} {
  if (exception instanceof NWSMigrationError) {
    return {
      statusCode: 400,
      code: 'NWS_MIGRATION_REQUIRED',
      message: exception.message,
      details: exception.issues.map((issue) => ({
        field: issue.path,
        issue: issue.message,
      })),
    };
  }

  if (exception instanceof NWSValidationError) {
    return {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: exception.message,
      details: exception.issues.map((issue) => ({
        field: issue.path,
        issue: issue.message,
      })),
    };
  }

  if (exception instanceof ApiValidationError) {
    return {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: exception.message,
      details: exception.details,
    };
  }

  if (exception instanceof NWSParseInputError) {
    return {
      statusCode: 422,
      code: 'WORKLOAD_PARSE_ERROR',
      message: exception.message,
      details: [],
    };
  }

  if (exception instanceof ApiNotFoundError) {
    return {
      statusCode: 404,
      code: 'NOT_FOUND',
      message: exception.message,
      details: [],
    };
  }

  if (exception instanceof ApiUnauthorizedError) {
    return {
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: exception.message,
      details: [],
    };
  }

  if (exception instanceof ApiForbiddenError) {
    return {
      statusCode: 403,
      code: 'FORBIDDEN',
      message: exception.message,
      details: [],
    };
  }

  if (exception instanceof RateLimitExceededError) {
    return {
      statusCode: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      message: exception.message,
      details: [],
      retryAfterSeconds: exception.retryAfterSeconds,
    };
  }

  if (exception instanceof ComparisonUnavailableError) {
    return {
      statusCode: 503,
      code: 'PRICING_UNAVAILABLE',
      message: exception.message,
      details: exception.failures.map((failure) => ({
        field: failure.providerId,
        issue: failure.message,
      })),
    };
  }

  if (exception instanceof LiveRefreshUnavailableError) {
    return {
      statusCode: 503,
      code: 'LIVE_REFRESH_UNAVAILABLE',
      message: exception.message,
      details: [],
    };
  }

  if (exception instanceof HttpException) {
    const response = exception.getResponse();
    return {
      statusCode: exception.getStatus(),
      code: 'HTTP_ERROR',
      message:
        typeof response === 'object' && response !== null && 'message' in response
          ? String(response.message)
          : exception.message,
      details: [],
    };
  }

  return {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    message: 'Unexpected server error',
    details: [],
  };
}

function serializeExceptionForLog(exception: unknown): {
  name: string;
  message: string;
  stack?: string;
} {
  if (exception instanceof Error) {
    return {
      name: exception.name,
      message: exception.message,
      ...(exception.stack ? { stack: exception.stack } : {}),
    };
  }

  return {
    name: typeof exception,
    message: String(exception),
  };
}
