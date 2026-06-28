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

export function escapePdfText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n\t]/g, ' ');
}
