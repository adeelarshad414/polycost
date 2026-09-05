import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { shutdownTracing } from './tracing.js';

/**
 * Flushes batched spans during shutdown.
 *
 * Spans are exported in batches, so without an explicit flush every deploy
 * discards the traces for requests that were in flight when SIGTERM arrived -
 * exactly the requests worth looking at after a bad rollout.
 *
 * A Nest lifecycle hook rather than a signal handler: bootstrap already calls
 * enableShutdownHooks(), so this runs inside the existing shutdown sequence
 * instead of racing it to exit.
 */
@Injectable()
export class TracingLifecycle implements OnApplicationShutdown {
  private readonly logger = new Logger(TracingLifecycle.name);

  async onApplicationShutdown(): Promise<void> {
    try {
      await shutdownTracing();
    } catch (error) {
      // Shutdown must not be blocked by telemetry cleanup.
      this.logger.warn(`Tracing shutdown failed: ${(error as Error).message}`);
    }
  }
}
