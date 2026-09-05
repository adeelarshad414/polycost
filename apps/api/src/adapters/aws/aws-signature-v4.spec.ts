import { signAwsJsonRequest } from './aws-signature-v4.js';

describe('signAwsJsonRequest', () => {
  it('includes session tokens in signed AWS requests when provided', () => {
    const signed = signAwsJsonRequest({
      credentials: {
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
        sessionToken: 'test-session-token',
      },
      region: 'us-east-1',
      service: 'pricing',
      host: 'api.pricing.us-east-1.amazonaws.com',
      target: 'AWSPriceListService.GetProducts',
      body: '{"ServiceCode":"AmazonEC2"}',
      now: new Date('2026-06-28T00:00:00.000Z'),
    });

    expect(signed.headers['x-amz-security-token']).toBe('test-session-token');
    expect(signed.headers.authorization).toContain('SignedHeaders=');
    expect(signed.headers.authorization).toContain('Signature=');
  });
});
