import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { AppConfig } from '../config/config.schema';
import { InvitationDeliveryService } from './invitation-delivery.service';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const invitation = {
  id: '88888888-8888-4888-8888-888888888888',
  teamId: '22222222-2222-4222-8222-222222222222',
  email: 'finops@example.com',
  role: 'member' as const,
  status: 'pending' as const,
  invitedByAccountId: '11111111-1111-4111-8111-111111111111',
  expiresAt: '2026-07-13T00:00:00.000Z',
  createdAt: '2026-07-06T00:00:00.000Z',
};

describe('InvitationDeliveryService', () => {
  it('uses panel delivery for local demos without calling outbound webhooks', async () => {
    const fetcher = jest.fn();
    const service = new InvitationDeliveryService(configService({}), fetcher);

    await expect(service.deliverTeamInvitation(deliveryInput())).resolves.toMatchObject({
      mode: 'panel',
      status: 'not_configured',
      tokenExposedInResponse: true,
      message: expect.stringContaining('demo token'),
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('sends a signed webhook payload without leaking raw token in the receipt', async () => {
    const fetcher: jest.MockedFunction<FetchLike> = jest.fn(
      async (input: string, init?: RequestInit) => {
        expect(input).toBe('https://mail.example.com/polycost/invites');
        expect(init).toBeDefined();
        return response(202);
      },
    );
    const service = new InvitationDeliveryService(
      configService({
        AUTH_INVITE_DELIVERY_MODE: 'webhook',
        AUTH_INVITE_DELIVERY_WEBHOOK_URL: 'https://mail.example.com/polycost/invites',
        AUTH_INVITE_DELIVERY_WEBHOOK_SECRET: 'test-webhook-secret-value',
        AUTH_INVITE_EMAIL_FROM: 'PolyCost <noreply@example.com>',
      }),
      fetcher,
    );

    const receipt = await service.deliverTeamInvitation(deliveryInput('resent'));

    expect(receipt).toMatchObject({
      mode: 'webhook',
      status: 'accepted',
      tokenExposedInResponse: false,
    });
    const requestInit = fetcher.mock.calls[0]?.[1] as
      (RequestInit & { headers: Record<string, string>; body: string }) | undefined;
    expect(requestInit).toBeDefined();
    expect(fetcher).toHaveBeenCalledWith(
      'https://mail.example.com/polycost/invites',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'x-polycost-event': 'team_invitation.resent',
        }),
      }),
    );
    const body = String(requestInit?.body);
    const signature = createHmac('sha256', 'test-webhook-secret-value').update(body).digest('hex');
    expect(requestInit?.headers['x-polycost-signature-sha256']).toBe(signature);
    expect(JSON.parse(body)).toEqual(
      expect.objectContaining({
        event: 'team_invitation.resent',
        to: {
          email: 'finops@example.com',
        },
        invitation: expect.objectContaining({
          id: invitation.id,
          role: 'member',
        }),
        inviteUrl: 'https://app.example.com/?invite_token=raw-token',
        email: {
          from: 'PolyCost <noreply@example.com>',
        },
      }),
    );
  });

  it('returns a failed delivery receipt when the webhook rejects the payload', async () => {
    const service = new InvitationDeliveryService(
      configService({
        AUTH_INVITE_DELIVERY_MODE: 'webhook',
        AUTH_INVITE_DELIVERY_WEBHOOK_URL: 'https://mail.example.com/polycost/invites',
        AUTH_INVITE_DELIVERY_WEBHOOK_SECRET: 'test-webhook-secret-value',
      }),
      jest.fn(async () => response(503)),
    );

    await expect(service.deliverTeamInvitation(deliveryInput())).resolves.toMatchObject({
      mode: 'webhook',
      status: 'failed',
      tokenExposedInResponse: false,
      message: expect.stringContaining('HTTP 503'),
    });
  });
});

function deliveryInput(action: 'created' | 'resent' = 'created') {
  return {
    invitation,
    inviteUrl: 'https://app.example.com/?invite_token=raw-token',
    invitedBy: {
      accountId: '11111111-1111-4111-8111-111111111111',
      email: 'architect@example.com',
    },
    action,
  };
}

function response(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
  } as Response;
}

function configService(values: Partial<AppConfig>): ConfigService<AppConfig, true> {
  return {
    get: jest.fn((key: keyof AppConfig) => {
      switch (key) {
        case 'AUTH_INVITE_DELIVERY_MODE':
          return values.AUTH_INVITE_DELIVERY_MODE;
        case 'AUTH_INVITE_DELIVERY_WEBHOOK_URL':
          return values.AUTH_INVITE_DELIVERY_WEBHOOK_URL;
        case 'AUTH_INVITE_DELIVERY_WEBHOOK_SECRET':
          return values.AUTH_INVITE_DELIVERY_WEBHOOK_SECRET;
        case 'AUTH_INVITE_EMAIL_FROM':
          return values.AUTH_INVITE_EMAIL_FROM;
        default:
          return undefined;
      }
    }),
  } as unknown as ConfigService<AppConfig, true>;
}
