import { createHmac } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema';
import { TeamInvitationDeliveryReceipt, TeamInvitationRecord } from './auth.types';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
export const INVITATION_DELIVERY_FETCH = Symbol('INVITATION_DELIVERY_FETCH');

interface InvitationDeliveryRequest {
  invitation: Omit<TeamInvitationRecord, 'inviteToken' | 'inviteUrl' | 'delivery'>;
  inviteUrl: string;
  invitedBy: {
    accountId: string;
    email: string;
  };
  action: 'created' | 'resent';
}

interface InvitationWebhookPayload {
  event: 'team_invitation.created' | 'team_invitation.resent';
  to: {
    email: string;
  };
  invitation: {
    id: string;
    teamId: string;
    role: Exclude<TeamInvitationRecord['role'], 'owner'>;
    expiresAt: string;
    action: 'created' | 'resent';
  };
  invitedBy: {
    accountId: string;
    email: string;
  };
  inviteUrl: string;
  email?: {
    from: string;
  };
}

@Injectable()
export class InvitationDeliveryService {
  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    @Optional()
    @Inject(INVITATION_DELIVERY_FETCH)
    private readonly fetcher: FetchLike = (input, init) => fetch(input, init),
  ) {}

  async deliverTeamInvitation(
    input: InvitationDeliveryRequest,
  ): Promise<TeamInvitationDeliveryReceipt> {
    const mode = this.configService.get('AUTH_INVITE_DELIVERY_MODE', { infer: true }) ?? 'panel';

    if (mode === 'panel') {
      return {
        mode: 'panel',
        status: 'not_configured',
        message: 'Invite delivery webhook is not configured; share the demo token from the panel.',
        tokenExposedInResponse: true,
      };
    }

    return this.deliverWithWebhook(input);
  }

  private async deliverWithWebhook(
    input: InvitationDeliveryRequest,
  ): Promise<TeamInvitationDeliveryReceipt> {
    const webhookUrl = this.configService.get('AUTH_INVITE_DELIVERY_WEBHOOK_URL', {
      infer: true,
    });
    const webhookSecret = this.configService.get('AUTH_INVITE_DELIVERY_WEBHOOK_SECRET', {
      infer: true,
    });

    if (!webhookUrl || !webhookSecret) {
      return {
        mode: 'webhook',
        status: 'failed',
        message: 'Invite delivery webhook is missing URL or signing secret.',
        tokenExposedInResponse: false,
      };
    }

    const body = JSON.stringify(this.webhookPayload(input));
    const signature = createHmac('sha256', webhookSecret).update(body).digest('hex');

    try {
      const response = await this.fetcher(webhookUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'polycost-invite-delivery/1.0',
          'x-polycost-event': `team_invitation.${input.action}`,
          'x-polycost-signature-sha256': signature,
        },
        body,
      });

      if (!response.ok) {
        return {
          mode: 'webhook',
          status: 'failed',
          message: `Invite delivery webhook returned HTTP ${response.status}.`,
          tokenExposedInResponse: false,
        };
      }

      return {
        mode: 'webhook',
        status: 'accepted',
        deliveredAt: new Date().toISOString(),
        message: 'Invite delivery webhook accepted the invitation.',
        tokenExposedInResponse: false,
      };
    } catch {
      return {
        mode: 'webhook',
        status: 'failed',
        message: 'Invite delivery webhook request failed.',
        tokenExposedInResponse: false,
      };
    }
  }

  private webhookPayload(input: InvitationDeliveryRequest): InvitationWebhookPayload {
    const emailFrom = this.configService.get('AUTH_INVITE_EMAIL_FROM', { infer: true });

    return {
      event: input.action === 'created' ? 'team_invitation.created' : 'team_invitation.resent',
      to: {
        email: input.invitation.email,
      },
      invitation: {
        id: input.invitation.id,
        teamId: input.invitation.teamId,
        role: input.invitation.role,
        expiresAt: input.invitation.expiresAt,
        action: input.action,
      },
      invitedBy: input.invitedBy,
      inviteUrl: input.inviteUrl,
      ...(emailFrom
        ? {
            email: {
              from: emailFrom,
            },
          }
        : {}),
    };
  }
}
