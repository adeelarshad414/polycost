import { createHash, createHmac } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema.js';
import { AuthIdentity } from './auth.types.js';
import { InvoiceEvidencePacketResponse } from './billing.types.js';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
type NowProvider = () => Date;
export const INVOICE_EVIDENCE_NOTARY_FETCH = Symbol('INVOICE_EVIDENCE_NOTARY_FETCH');
export const INVOICE_EVIDENCE_NOTARY_NOW = Symbol('INVOICE_EVIDENCE_NOTARY_NOW');

const MAX_NOTARY_HANDOFF_BYTES = 512 * 1024;

export interface InvoiceEvidenceNotaryDeliveryResult {
  status: 'skipped' | 'accepted' | 'failed';
  mode: 'disabled' | 'external-webhook';
  attemptedAt?: string;
  urlHost?: string;
  urlSha256?: string;
  requestDigestSha256?: string;
  acceptedSubjectDigestSha256?: string;
  responseStatusCode?: number;
  message: string;
}

interface InvoiceEvidenceNotaryHandoffPayload {
  schemaVersion: 'invoice-evidence-notary-handoff/v1';
  event: 'invoice_evidence_packet.exported';
  exportedAt: string;
  subject: InvoiceEvidencePacketResponse['integrity']['subject'];
  packetDigestSha256: string;
  basePayloadDigestSha256: string;
  receiptStatus: InvoiceEvidencePacketResponse['receipt']['status'];
  receiptMode: InvoiceEvidencePacketResponse['receipt']['mode'];
  actor: {
    accountId: string;
    email: string;
    teamId?: string;
  };
  packet: InvoiceEvidencePacketResponse;
}

@Injectable()
export class InvoiceEvidenceNotaryService {
  constructor(
    private readonly configService?: ConfigService<AppConfig, true>,
    @Optional()
    @Inject(INVOICE_EVIDENCE_NOTARY_FETCH)
    private readonly fetcher: FetchLike = (input, init) => fetch(input, init),
    @Optional()
    @Inject(INVOICE_EVIDENCE_NOTARY_NOW)
    private readonly nowProvider: NowProvider = () => new Date(),
  ) {}

  async deliverPacket(input: {
    packet: InvoiceEvidencePacketResponse;
    identity: AuthIdentity;
    teamId?: string;
  }): Promise<InvoiceEvidenceNotaryDeliveryResult> {
    const mode =
      this.configService?.get('INVOICE_EVIDENCE_RECEIPT_MODE', { infer: true }) ?? 'metadata-only';

    if (mode !== 'external-webhook') {
      return {
        status: 'skipped',
        mode: 'disabled',
        message: 'External invoice evidence notary webhook mode is not enabled.',
      };
    }

    const webhookUrl = this.configService?.get('INVOICE_EVIDENCE_NOTARY_WEBHOOK_URL', {
      infer: true,
    });
    const signingSecret = this.configService?.get('INVOICE_EVIDENCE_RECEIPT_SIGNING_SECRET', {
      infer: true,
    });
    const signingKeyReference = this.configService?.get(
      'INVOICE_EVIDENCE_RECEIPT_SIGNING_KEY_REFERENCE',
      { infer: true },
    );

    if (!webhookUrl || !signingSecret) {
      return {
        status: 'failed',
        mode: 'external-webhook',
        message: 'External invoice evidence notary webhook URL or signing secret is missing.',
      };
    }

    const attemptedAt = this.nowProvider().toISOString();
    const payload: InvoiceEvidenceNotaryHandoffPayload = {
      schemaVersion: 'invoice-evidence-notary-handoff/v1',
      event: 'invoice_evidence_packet.exported',
      exportedAt: attemptedAt,
      subject: input.packet.integrity.subject,
      packetDigestSha256: input.packet.integrity.payloadDigestSha256,
      basePayloadDigestSha256: input.packet.receipt.basePayloadDigestSha256,
      receiptStatus: input.packet.receipt.status,
      receiptMode: input.packet.receipt.mode,
      actor: {
        accountId: input.identity.accountId,
        email: input.identity.email,
        ...(input.teamId ? { teamId: input.teamId } : {}),
      },
      packet: input.packet,
    };
    const body = JSON.stringify(payload);
    const requestDigestSha256 = sha256(body);
    const url = new URL(webhookUrl);

    if (Buffer.byteLength(body, 'utf8') > MAX_NOTARY_HANDOFF_BYTES) {
      return {
        status: 'failed',
        mode: 'external-webhook',
        attemptedAt,
        urlHost: url.host,
        urlSha256: sha256(webhookUrl),
        requestDigestSha256,
        acceptedSubjectDigestSha256: input.packet.receipt.basePayloadDigestSha256,
        message: 'External invoice evidence notary webhook payload exceeded the size limit.',
      };
    }

    const signature = createHmac('sha256', signingSecret).update(body).digest('hex');

    try {
      const response = await this.fetcher(webhookUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'polycost-invoice-evidence-notary/1.0',
          'x-polycost-event': 'invoice_evidence_packet.exported',
          'x-polycost-reconciliation-id': input.packet.integrity.subject.reconciliationId,
          'x-polycost-packet-digest-sha256': input.packet.integrity.payloadDigestSha256,
          'x-polycost-base-payload-digest-sha256': input.packet.receipt.basePayloadDigestSha256,
          'x-polycost-signature-sha256': signature,
          ...(signingKeyReference
            ? {
                'x-polycost-signing-key-reference': signingKeyReference,
              }
            : {}),
        },
        body,
      });

      return {
        status: response.ok ? 'accepted' : 'failed',
        mode: 'external-webhook',
        attemptedAt,
        urlHost: url.host,
        urlSha256: sha256(webhookUrl),
        requestDigestSha256,
        acceptedSubjectDigestSha256: input.packet.receipt.basePayloadDigestSha256,
        responseStatusCode: response.status,
        message: response.ok
          ? 'External invoice evidence notary webhook accepted the packet handoff request.'
          : `External invoice evidence notary webhook returned HTTP ${response.status}.`,
      };
    } catch {
      return {
        status: 'failed',
        mode: 'external-webhook',
        attemptedAt,
        urlHost: url.host,
        urlSha256: sha256(webhookUrl),
        requestDigestSha256,
        acceptedSubjectDigestSha256: input.packet.receipt.basePayloadDigestSha256,
        message: 'External invoice evidence notary webhook request failed.',
      };
    }
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
