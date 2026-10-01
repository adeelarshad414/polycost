import { createProxyTrust, requestIdentity } from './rate-limit.service.js';

describe('rate-limit client identity (audit H-02)', () => {
  it('keys on the address Fastify resolved, never on a client-written header', () => {
    expect(
      requestIdentity({
        ip: '203.0.113.9',
        headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' },
      }),
    ).toBe('203.0.113.9');
    expect(requestIdentity({ headers: { 'x-forwarded-for': '6.6.6.6' } })).toBe('unknown');
  });

  it('trusts nothing until configured, then exactly the configured hops', () => {
    const proxyTrust = createProxyTrust();
    expect(proxyTrust.trust('10.0.0.5', 0)).toBe(false);

    proxyTrust.setHops(1);
    expect(proxyTrust.trust('10.0.0.5', 0)).toBe(true);
    expect(proxyTrust.trust('6.6.6.6', 1)).toBe(false);

    proxyTrust.setHops(0);
    expect(proxyTrust.trust('10.0.0.5', 0)).toBe(false);
  });
});
