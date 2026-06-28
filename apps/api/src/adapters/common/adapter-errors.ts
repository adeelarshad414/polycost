import { ProviderId } from './cloud-provider-adapter';

export class AdapterError extends Error {
  constructor(
    readonly providerId: ProviderId,
    message: string,
  ) {
    super(`[${providerId}] ${message}`);
    this.name = 'AdapterError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AdapterApiError extends AdapterError {
  constructor(providerId: ProviderId, status: number, statusText: string, body: string) {
    super(providerId, `pricing API request failed with ${status} ${statusText}: ${body}`);
    this.name = 'AdapterApiError';
  }
}

export class AdapterCredentialError extends AdapterError {
  constructor(providerId: ProviderId, message: string) {
    super(providerId, message);
    this.name = 'AdapterCredentialError';
  }
}

export class AdapterPricingError extends AdapterError {
  constructor(providerId: ProviderId, message: string) {
    super(providerId, message);
    this.name = 'AdapterPricingError';
  }
}
