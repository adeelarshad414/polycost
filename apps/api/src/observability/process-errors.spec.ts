import { ErrorReporter } from './error-reporter.js';
import { registerProcessErrorHandlers, reportWorkerFailures } from './process-errors.js';

function captureReporter() {
  const sent: Array<{ exception: unknown; context: Record<string, unknown> }> = [];
  const reporter = {
    report: jest.fn(async (exception: unknown, context: Record<string, unknown> = {}) => {
      sent.push({ exception, context });
    }),
  } as unknown as ErrorReporter;

  return { reporter, sent };
}

function fakeWorker() {
  const listeners: Record<string, (job: unknown, error: Error) => void> = {};
  return {
    on(event: 'failed', listener: (job: unknown, error: Error) => void) {
      listeners[event] = listener;
      return this;
    },
    fail(job: unknown, error: Error) {
      listeners.failed?.(job, error);
    },
  };
}

describe('reportWorkerFailures', () => {
  it('reports a job that exhausted its retries', () => {
    const { reporter, sent } = captureReporter();
    const worker = fakeWorker();
    reportWorkerFailures(worker, 'cost-management', reporter);

    worker.fail({ name: 'evaluate-budget-alerts' }, new Error('provider timeout'));

    expect(sent).toHaveLength(1);
    expect((sent[0].exception as Error).message).toBe('provider timeout');
    expect(sent[0].context).toEqual({
      queue: 'cost-management',
      job: 'evaluate-budget-alerts',
    });
  });

  it('never sends the job payload', () => {
    const { reporter, sent } = captureReporter();
    const worker = fakeWorker();
    reportWorkerFailures(worker, 'pricing-etl', reporter);

    worker.fail(
      { name: 'refresh', data: { tenantId: 'acme-corp', apiKey: 'super-secret' } },
      new Error('boom'),
    );

    // Job data can carry workload and tenant details; only the queue and job
    // name are safe to send off-box.
    expect(JSON.stringify(sent[0].context)).not.toContain('acme-corp');
    expect(JSON.stringify(sent[0].context)).not.toContain('super-secret');
  });

  it('logs the failure as well as reporting it', () => {
    const { reporter } = captureReporter();
    const logger = { error: jest.fn() };
    const worker = fakeWorker();
    reportWorkerFailures(worker, 'pricing-etl', reporter, logger);

    worker.fail({ name: 'refresh' }, new Error('boom'));

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'job_failed', queue: 'pricing-etl', job: 'refresh' }),
    );
  });

  it('copes with a failure that has no job object', () => {
    const { reporter, sent } = captureReporter();
    const worker = fakeWorker();
    reportWorkerFailures(worker, 'pricing-etl', reporter);

    expect(() => worker.fail(undefined, new Error('boom'))).not.toThrow();
    expect(sent[0].context.job).toBe('unknown');
  });

  it('is inert when reporting is disabled', () => {
    const worker = fakeWorker();
    reportWorkerFailures(worker, 'pricing-etl', undefined);

    expect(() => worker.fail({ name: 'refresh' }, new Error('boom'))).not.toThrow();
  });
});

describe('registerProcessErrorHandlers', () => {
  let teardown: (() => void) | undefined;

  afterEach(() => {
    teardown?.();
    teardown = undefined;
  });

  it('reports an unhandled rejection and keeps the process alive', async () => {
    const { reporter, sent } = captureReporter();
    const exit = jest.fn();
    teardown = registerProcessErrorHandlers(reporter, undefined, exit);

    process.emit('unhandledRejection', new Error('nobody caught me'), Promise.resolve());
    await Promise.resolve();

    expect(sent).toHaveLength(1);
    expect(sent[0].context).toEqual({ kind: 'unhandledRejection' });
    // A rejection is recoverable; only an uncaught exception ends the process.
    expect(exit).not.toHaveBeenCalled();
  });

  it('reports a non-Error rejection reason', async () => {
    const { reporter, sent } = captureReporter();
    teardown = registerProcessErrorHandlers(reporter, undefined, jest.fn());

    process.emit('unhandledRejection', 'just a string', Promise.resolve());
    await Promise.resolve();

    expect(sent[0].exception).toBe('just a string');
  });

  it('reports an uncaught exception and then exits non-zero', async () => {
    const { reporter, sent } = captureReporter();
    const exit = jest.fn();
    teardown = registerProcessErrorHandlers(reporter, undefined, exit);

    process.emit('uncaughtException', new Error('fatal'), 'uncaughtException');
    await new Promise((resolve) => setImmediate(resolve));

    expect(sent).toHaveLength(1);
    // After an uncaught exception the process state is undefined; the handler
    // exists to report before exiting, not to swallow the failure.
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('still exits when the collector never answers', async () => {
    const exit = jest.fn();
    const hanging = { report: () => new Promise<void>(() => {}) } as unknown as ErrorReporter;
    teardown = registerProcessErrorHandlers(hanging, undefined, exit);

    jest.useFakeTimers();
    process.emit('uncaughtException', new Error('fatal'), 'uncaughtException');
    jest.advanceTimersByTime(2_500);
    jest.useRealTimers();
    await new Promise((resolve) => setImmediate(resolve));

    // Waiting forever on a dead collector would hang the container.
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('removes its handlers on teardown', () => {
    const { reporter, sent } = captureReporter();
    const remove = registerProcessErrorHandlers(reporter, undefined, jest.fn());
    remove();

    process.emit('unhandledRejection', new Error('after teardown'), Promise.resolve());

    expect(sent).toHaveLength(0);
  });
});
