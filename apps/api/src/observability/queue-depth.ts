import { DomainMetricsService } from './domain-metrics.service.js';

/** The BullMQ states worth publishing; `completed` is unbounded and excluded. */
const QUEUE_STATES = ['waiting', 'active', 'delayed', 'failed'] as const;

interface JobCountReader {
  getJobCounts?(...states: string[]): Promise<Record<string, number>>;
}

/**
 * Registers a queue for scrape-time depth sampling.
 *
 * Depth is read from the queue on each scrape rather than tracked with
 * counters, because the queue is the source of truth: a counter would drift the
 * moment a job is retried, stalled, or removed by another process.
 *
 * A queue whose driver cannot report counts is skipped rather than reported as
 * zero - an empty queue and an unreadable one must not look the same on a
 * dashboard.
 */
export function registerQueueDepth(
  metrics: DomainMetricsService | undefined,
  queueName: string,
  queue: JobCountReader,
): void {
  if (!metrics || typeof queue.getJobCounts !== 'function') {
    return;
  }

  metrics.registerQueueDepthSource(queueName, async () => {
    const counts = await queue.getJobCounts!(...QUEUE_STATES);

    return {
      waiting: counts.waiting,
      active: counts.active,
      delayed: counts.delayed,
      failed: counts.failed,
    };
  });
}
