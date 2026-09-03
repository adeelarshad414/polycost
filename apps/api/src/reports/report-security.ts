const FORMULA_PREFIX_CHARS = new Set(['=', '+', '-', '@', '\t', '\r', '\n']);

export function sanitizeSpreadsheetText(value: string): string {
  if (value.length === 0) {
    return value;
  }

  return FORMULA_PREFIX_CHARS.has(value[0]) ? `'${value}` : value;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Typographic characters mapped to WinAnsi equivalents before escaping.
 *
 * These arrive from provider names, service descriptions and pasted input. Left
 * alone they would each render as a pair of stray marks, because the content
 * stream is written as UTF-8 while the font reads one byte per glyph.
 */
const PDF_CHARACTER_SUBSTITUTIONS: Array<[RegExp, string]> = [
  [/[\u2018\u2019\u201B]/g, "'"],
  [/[\u201C\u201D]/g, '"'],
  [/[\u2013\u2014]/g, '-'],
  [/\u2026/g, '...'],
  [/\u00A0/g, ' '],
];

export function escapePdfText(value: string): string {
  let text = value;

  for (const [pattern, replacement] of PDF_CHARACTER_SUBSTITUTIONS) {
    text = text.replace(pattern, replacement);
  }

  return text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[^\x20-\x7E]/g, (character) => {
      const code = character.codePointAt(0) ?? 63;

      // WinAnsi covers 0xA0-0xFF directly. An octal escape is a single byte to
      // the PDF reader even though it is written as ASCII here, which is what
      // makes this survive a UTF-8 encoded content stream.
      if (code >= 0xa0 && code <= 0xff) {
        return `\\${code.toString(8).padStart(3, '0')}`;
      }

      // Anything else has no glyph in this font; '?' is honest about that
      // rather than emitting bytes that render as noise.
      return '?';
    });
}
