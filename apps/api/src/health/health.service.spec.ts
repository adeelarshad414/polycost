import { EventEmitter } from 'node:events';

jest.mock('node:net', () => ({
  __esModule: true,
  default: {
    createConnection: jest.fn(),
  },
}));

import net from 'node:net';
import { probeTcp } from './health.service';

class FakeSocket extends EventEmitter {
  setTimeout = jest.fn();
  destroy = jest.fn();
}

describe('probeTcp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports an available TCP dependency as healthy', async () => {
    const socket = fakeConnection();
    const health = probeTcp('127.0.0.1', 5432, 500);

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
    const socket = fakeConnection();
    const health = probeTcp('redis', 6379, 500);

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
    const socket = fakeConnection();
    const health = probeTcp('postgres', 5432, 500);

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
});

function fakeConnection(): FakeSocket {
  const socket = new FakeSocket();
  jest.mocked(net.createConnection).mockReturnValue(socket as never);
  return socket;
}
