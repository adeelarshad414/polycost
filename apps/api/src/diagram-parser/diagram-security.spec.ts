import { describe, it, expect } from '@jest/globals';
import { sanitizeDisplayText } from './diagram-security.js';

// CodeQL js/double-escaping: decoding `&amp;` before the other entities turned
// `&amp;quot;` into `"` - one decode step too many, which can smuggle markup
// that was escaped twice past the tag stripper.
describe('sanitizeDisplayText entity decoding', () => {
  it('decodes each entity exactly once', () => {
    expect(sanitizeDisplayText('Orders &amp;quot;primary&amp;quot;', 'x')).toBe(
      'Orders &quot;primary&quot;',
    );
    expect(sanitizeDisplayText('Web &amp; API', 'x')).toBe('Web & API');
    expect(sanitizeDisplayText('Cache &quot;hot&quot;', 'x')).toBe('Cache "hot"');
  });

  it('keeps double-escaped markup as text instead of decoding it into a tag', () => {
    expect(sanitizeDisplayText('&amp;lt;script&amp;gt;alert(1)', 'x')).toBe(
      '&lt;script&gt;alert(1)',
    );
  });
});
