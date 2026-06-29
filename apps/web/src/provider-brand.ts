import { ProviderId } from './types';

export function providerLogoSrc(providerId: ProviderId): string {
  switch (providerId) {
    case 'aws':
      return '/cloud/aws-logo.svg';
    case 'azure':
      return '/cloud/azure-logo.svg';
    case 'gcp':
      return '/cloud/gcp-logo.svg';
  }
}
