import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { ApiValidationError } from '../api/api-errors';
import {
  DIAGRAM_INFLATED_MAX_BYTES,
  DIAGRAM_UPLOAD_MAX_BYTES,
  DiagramInputFormat,
} from './diagram-parser.types';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const XML_ENTITY_PATTERN = /<!DOCTYPE|<!ENTITY|\bSYSTEM\b|\bPUBLIC\b/i;

export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export function assertUploadSize(buffer: Buffer): void {
  if (buffer.length === 0) {
    throw new ApiValidationError('Diagram content is required', [
      { field: 'content', issue: 'must not be empty' },
    ]);
  }

  if (buffer.length > DIAGRAM_UPLOAD_MAX_BYTES) {
    throw new ApiValidationError('Diagram upload exceeds the 5MB limit', [
      { field: 'content', issue: `received ${buffer.length} bytes` },
    ]);
  }
}

export function assertNoBinaryImageSpoof(buffer: Buffer, fileName?: string): void {
  if (buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    throw new ApiValidationError('Diagram file content does not match a supported diagram format', [
      {
        field: 'content',
        issue: `${fileName ?? 'upload'} looks like a PNG image, not a diagram source`,
      },
    ]);
  }
}

export function assertXmlSafe(xml: string): void {
  if (XML_ENTITY_PATTERN.test(xml)) {
    throw new ApiValidationError('Diagram XML contains blocked entity declarations', [
      {
        field: 'content',
        issue: 'DOCTYPE, ENTITY, SYSTEM, and PUBLIC declarations are not allowed',
      },
    ]);
  }
}

export function inflateRawDiagramPayload(
  compressed: Buffer,
  sourceField: string,
  maxBytes = DIAGRAM_INFLATED_MAX_BYTES,
): string {
  const inflated = inflateRawSync(compressed, {
    maxOutputLength: maxBytes + 1,
  });

  assertInflatedPayloadSafe(compressed.length, inflated.length, sourceField, maxBytes);

  return inflated.toString('utf8');
}

export function assertInflatedPayloadSafe(
  compressedBytes: number,
  inflatedBytes: number,
  sourceField: string,
  maxBytes = DIAGRAM_INFLATED_MAX_BYTES,
): void {
  if (inflatedBytes > maxBytes) {
    throw new ApiValidationError('Diagram compressed payload expands beyond the safe limit', [
      { field: sourceField, issue: `inflated to ${inflatedBytes} bytes` },
    ]);
  }

  const denominator = Math.max(1, compressedBytes);
  const ratio = inflatedBytes / denominator;

  if (inflatedBytes > 512 * 1024 && ratio > 100) {
    throw new ApiValidationError('Diagram compressed payload looks like a compression bomb', [
      {
        field: sourceField,
        issue: `compression ratio ${Math.round(ratio)}:1 exceeds the safe threshold`,
      },
    ]);
  }
}

export function isZipBuffer(buffer: Buffer): boolean {
  return buffer.subarray(0, ZIP_MAGIC.length).equals(ZIP_MAGIC);
}

export function sanitizeDisplayText(value: string, fallback: string): string {
  const stripped = decodeHtmlEntities(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return (removeControlCharacters(stripped) || fallback).slice(0, 96);
}

export function sanitizeSourceRef(format: DiagramInputFormat, ref: string): string {
  return `${format}:${ref.replace(/[^\w:.-]/g, '_').slice(0, 80)}`;
}

export function safeFileName(fileName: string | undefined): string | undefined {
  const cleaned = fileName
    ?.split(/[\\/]/)
    .pop()
    ?.replace(/[^\w .()-]/g, '')
    .trim();

  return cleaned ? cleaned.slice(0, 160) : undefined;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    );
}

function removeControlCharacters(value: string): string {
  return Array.from(value)
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;

      return codePoint < 32 || codePoint === 127 ? ' ' : character;
    })
    .join('');
}
