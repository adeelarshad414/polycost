import { describe, expect, it, jest } from '@jest/globals';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { AuthIdentity, RequestWithAuth } from './auth.types.js';
import { SessionAuthGuard } from './session-auth.guard.js';

const contextFor = (request: Partial<RequestWithAuth>) =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

const identity: AuthIdentity = {
  accountId: 'account-1',
  email: 'owner@example.com',
  teamId: 'team-1',
  role: 'owner',
  sessionId: 'session-1',
  expiresAt: '2099-01-01T00:00:00.000Z',
};

describe('SessionAuthGuard', () => {
  it('attaches the authenticated identity to the request', async () => {
    const authenticateRequest = jest.fn<AuthService['authenticateRequest']>(async () => identity);
    const guard = new SessionAuthGuard({ authenticateRequest } as unknown as AuthService);
    const request: Partial<RequestWithAuth> = { headers: {} };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.auth).toBe(identity);
    expect(authenticateRequest).toHaveBeenCalledWith(request);
  });

  it('lets an authentication failure reject the request', async () => {
    const guard = new SessionAuthGuard({
      authenticateRequest: async () => {
        throw new UnauthorizedException();
      },
    } as unknown as AuthService);
    const request: Partial<RequestWithAuth> = { headers: {} };

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(request.auth).toBeUndefined();
  });
});
