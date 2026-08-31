import { LoggerService } from '@nestjs/common';
import pino, { Logger as PinoLogger } from 'pino';
import { currentRequestId } from './request-context';

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

export interface StructuredLoggerOptions {
  level?: LogLevel;
  /** Emit human-readable lines instead of JSON. Intended for local development. */
  pretty?: boolean;
  destination?: pino.DestinationStream;
}

/**
 * Nest LoggerService backed by pino.
 *
 * Replaces the default console logger so every line is a single JSON object
 * carrying the request id. Without that, logs cannot be correlated: a failing
 * request produces lines across the controller, service and repository with
 * nothing tying them together.
 */
export class StructuredLogger implements LoggerService {
  private readonly logger: PinoLogger;

  constructor(options: StructuredLoggerOptions = {}) {
    this.logger = pino(
      {
        level: options.level ?? 'info',
        base: { service: 'polycost-api' },
        // Defence in depth: these must never reach a log sink even if a caller
        // passes a whole request or config object as metadata.
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'headers.authorization',
            'headers.cookie',
            'password',
            'token',
            'secret',
            '*.password',
            '*.token',
            '*.secret',
          ],
          censor: '[redacted]',
        },
        ...(options.pretty
          ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
          : {}),
      },
      options.destination,
    );
  }

  private write(level: LogLevel, message: unknown, context?: string, extra?: unknown): void {
    const requestId = currentRequestId();
    const payload: Record<string, unknown> = {
      ...(context ? { context } : {}),
      ...(requestId ? { requestId } : {}),
      ...(extra !== undefined ? { detail: extra } : {}),
    };

    // Nest passes objects as the message for some call sites; keep them
    // structured rather than stringifying into an opaque blob.
    if (typeof message === 'string') {
      this.logger[level](payload, message);
      return;
    }

    this.logger[level]({ ...payload, ...(message as Record<string, unknown>) });
  }

  log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }

  error(message: unknown, stack?: string, context?: string): void {
    this.write('error', message, context, stack);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('trace', message, context);
  }
}
