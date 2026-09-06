import { describe, it, expect } from '@jest/globals';
import { jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import type net from 'node:net';
import { probeTcp, type ConnectionFactory } from './health.service.js';

/*
  This spec used to reach for `jest.mock('node:net')`, which does not work under
  ESM without `unstable_mockModule` and a dynamic import of the module under
  test. probeTcp now takes its connection factory as a parameter, so the double
  is passed in rather than swapped underneath - the same coverage, exercising
  the real control flow instead of replacing the module it depends on.
*/

class FakeSocket extends EventEmitter {
  setTimeout = jest.fn<net.Socket['setTimeout']>();
  destroy = jest.fn<net.Socket['destroy']>();
}

/** A factory that always hands back the same socket, so the test can drive it. */
function fakeConnection(): { socket: FakeSocket; connect: ConnectionFactory } {
  const socket = new FakeSocket();
  return { socket, connect: () => socket as unknown as net.Socket };
}

describe('probeTcp', () => {
  it('reports an available TCP dependency as healthy', async () => {
    const { socket, connect } = fakeConnection();
    const health = probeTcp('127.0.0.1', 5432, 500, connect);

    socket.emit('connect');

    await expect(health).resolves.toMatchObject({
      status: 'ok',
      host: '127.0.0.1',
      port: 5432,
    });
    expect(socket.setTimeout).toHaveBeenCalledWith(500);
    expect(socket.destroy).toHaveBeenCalledTimes(1);
  });

  it('reports timeouts as degraded', async () => {
    const { socket, connect } = fakeConnection();
    const health = probeTcp('redis', 6379, 500, connect);

    socket.emit('timeout');

    await expect(health).resolves.toMatchObject({
      status: 'degraded',
      host: 'redis',
      port: 6379,
      error: 'timeout',
    });
    expect(socket.destroy).toHaveBeenCalledTimes(1);
  });

  it('reports connection errors as degraded without throwing', async () => {
    const { socket, connect } = fakeConnection();
    const health = probeTcp('postgres', 5432, 500, connect);

    socket.emit('error', new Error('ECONNREFUSED'));
    socket.emit('connect');

    await expect(health).resolves.toMatchObject({
      status: 'degraded',
      host: 'postgres',
      port: 5432,
      error: 'ECONNREFUSED',
    });
    expect(socket.destroy).toHaveBeenCalledTimes(1);
  });

  it('passes the real host and port through to the connection factory', async () => {
    // The factory is now part of the contract, so the arguments it receives are
    // worth asserting - the module mock could never check this.
    const { socket, connect } = fakeConnection();
    const spy = jest.fn<ConnectionFactory>(connect);
    const health = probeTcp('db.internal', 6432, 250, spy);

    socket.emit('connect');
    await health;

    expect(spy).toHaveBeenCalledWith({ host: 'db.internal', port: 6432 });
  });
});
