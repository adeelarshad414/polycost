import { ErrorReporter } from './error-reporter.js';

/**
 * Captures errors that never reach the Nest exception filter.
 *
 * The filter only sees exceptions thrown while handling an HTTP request. Three
 * classes of failure escape it entirely:
 *
 * - an unhandled promise rejection anywhere in the process
 * - a synchronous throw outside a request (timers, event handlers)
 * - a BullMQ job that exhausts its retries
 *
 * The last one is not hypothetical: the cost-management queue accumulated
 * failed jobs that were never reported anywhere, and they were lost outright
 * when Redis restarted, because job state is not persisted. Reporting them
 * off-box is what makes the next occurrence survivable.
 */

export interface WorkerLike {
  on(event: 'failed', listener: (job: unknown, error: Error) => void): unknown;
}

export interface ProcessErrorLogger {
  error(message: unknown, stack?: string, context?: string): void;
}

/**
 * Reports a BullMQ job that has exhausted its retries.
 *
 * Attached per worker rather than globally because BullMQ has no process-wide
 * failure event, and a worker that emits 'failed' with no listener is silent.
 */
export function reportWorkerFailures(
  worker: WorkerLike,
  queueName: string,
  reporter: ErrorReporter | undefined,
  logger?: ProcessErrorLogger,
): void {
  worker.on('failed', (job, error) => {
    const jobName = jobNameOf(job);

    logger?.error({
      event: 'job_failed',
      queue: queueName,
      job: jobName,
      message: error?.message ?? String(error),
    });

    // Job payloads can carry workload and tenant data, so only the queue and
    // job name are sent - never the job's data.
    void reporter?.report(error, { queue: queueName, job: jobName });
  });
}

function jobNameOf(job: unknown): string {
  if (job && typeof job === 'object' && 'name' in job) {
    return String((job as { name: unknown }).name);
  }

  return 'unknown';
}

/**
 * Installs process-level handlers.
 *
 * uncaughtException deliberately does NOT keep the process alive. After one,
 * the process is in an undefined state and continuing risks corrupt work; the
 * container restarts and the orchestrator routes around it. The handler exists
 * so the error is reported before that happens, not to swallow it.
 */
export function registerProcessErrorHandlers(
  reporter: ErrorReporter | undefined,
  logger?: ProcessErrorLogger,
  exit: (code: number) => void = (code) => process.exit(code),
): () => void {
  const onRejection = (reason: unknown): void => {
    logger?.error({
      event: 'unhandled_rejection',
      message: reason instanceof Error ? reason.message : String(reason),
    });
    void reporter?.report(reason, { kind: 'unhandledRejection' });
  };

  const onException = (error: Error): void => {
    logger?.error({ event: 'uncaught_exception', message: error.message }, error.stack);

    // Give the report a bounded chance to leave the process, then exit
    // regardless. Waiting forever on a dead collector would hang the container.
    void Promise.race([
      reporter?.report(error, { kind: 'uncaughtException' }) ?? Promise.resolve(),
      new Promise((resolve) => {
        const timer = setTimeout(resolve, 2_000);
        timer.unref?.();
      }),
    ]).finally(() => exit(1));
  };

  process.on('unhandledRejection', onRejection);
  process.on('uncaughtException', onException);

  return () => {
    process.off('unhandledRejection', onRejection);
    process.off('uncaughtException', onException);
  };
}
