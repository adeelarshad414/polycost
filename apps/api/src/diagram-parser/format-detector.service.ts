import { Injectable } from '@nestjs/common';
import { ApiValidationError } from '../api/api-errors';
import {
  DecodedDiagramInput,
  DiagramInputFormat,
  DiagramParseRequest,
} from './diagram-parser.types';
import {
  assertNoBinaryImageSpoof,
  assertUploadSize,
  isZipBuffer,
  safeFileName,
  sha256,
} from './diagram-security';

const SUPPORTED_FORMATS: DiagramInputFormat[] = ['mermaid', 'drawio', 'lucid_csv', 'vsdx'];

@Injectable()
export class FormatDetectorService {
  decode(request: DiagramParseRequest): DecodedDiagramInput {
    if (!isRecord(request) || typeof request.content !== 'string') {
      throw new ApiValidationError('Diagram content is required', [
        { field: 'content', issue: 'must be a string' },
      ]);
    }

    const encoding = request.encoding ?? 'text';
    const buffer =
      encoding === 'base64' ? decodeBase64(request.content) : Buffer.from(request.content, 'utf8');
    const fileName = safeFileName(request.fileName);
    const mimeType = safeMimeType(request.mimeType);
    const requestedFormat = normalizeRequestedFormat(request.inputFormat);

    assertUploadSize(buffer);
    assertNoBinaryImageSpoof(buffer, fileName);

    const text = buffer.toString('utf8');
    const detectedFormat = detectFormat({
      buffer,
      text,
      fileName,
      mimeType,
      requestedFormat,
    });

    assertFormatCompatible(requestedFormat, detectedFormat);

    return {
      buffer,
      text: detectedFormat === 'vsdx' ? undefined : text,
      sizeBytes: buffer.length,
      sha256: sha256(buffer),
      requestedFormat,
      detectedFormat,
      fileName,
      mimeType,
    };
  }
}

function decodeBase64(content: string): Buffer {
  if (!/^[A-Za-z0-9+/=\s]+$/.test(content)) {
    throw new ApiValidationError('Diagram base64 payload is invalid', [
      { field: 'content', issue: 'contains non-base64 characters' },
    ]);
  }

  return Buffer.from(content.replace(/\s+/g, ''), 'base64');
}

function normalizeRequestedFormat(format: unknown): DiagramInputFormat | 'auto' | undefined {
  if (format === undefined || format === 'auto') {
    return format;
  }

  if (SUPPORTED_FORMATS.includes(format as DiagramInputFormat)) {
    return format as DiagramInputFormat;
  }

  throw new ApiValidationError('Unsupported diagram format', [
    { field: 'inputFormat', issue: 'must be auto, mermaid, drawio, lucid_csv, or vsdx' },
  ]);
}

function safeMimeType(mimeType: unknown): string | undefined {
  if (typeof mimeType !== 'string') {
    return undefined;
  }

  const cleaned = mimeType.trim().toLowerCase();

  return cleaned ? cleaned.slice(0, 120) : undefined;
}

function detectFormat({
  buffer,
  text,
  fileName,
  mimeType,
  requestedFormat,
}: {
  buffer: Buffer;
  text: string;
  fileName?: string;
  mimeType?: string;
  requestedFormat?: DiagramInputFormat | 'auto';
}): DiagramInputFormat {
  if (requestedFormat && requestedFormat !== 'auto') {
    if (requestedFormat === 'vsdx' && !isZipBuffer(buffer)) {
      throw new ApiValidationError('VSDX uploads must be OpenXML ZIP files', [
        { field: 'content', issue: 'missing ZIP file signature' },
      ]);
    }

    return requestedFormat;
  }

  const lowerName = fileName?.toLowerCase() ?? '';
  const trimmed = text.trimStart();

  if (isZipBuffer(buffer) || lowerName.endsWith('.vsdx')) {
    return 'vsdx';
  }

  if (
    lowerName.endsWith('.drawio') ||
    lowerName.endsWith('.xml') ||
    mimeType === 'application/xml' ||
    /^<\?xml\b|^<mxfile\b|^<diagram\b|^<mxGraphModel\b/i.test(trimmed)
  ) {
    return 'drawio';
  }

  if (
    lowerName.endsWith('.csv') ||
    /^"?id"?\s*,/i.test(trimmed) ||
    /"?line source"?\s*,\s*"?line destination"?/i.test(trimmed)
  ) {
    return 'lucid_csv';
  }

  if (/^(flowchart|graph|sequenceDiagram|stateDiagram|classDiagram|erDiagram)\b/i.test(trimmed)) {
    return 'mermaid';
  }

  throw new ApiValidationError('Could not detect a supported diagram format', [
    {
      field: 'content',
      issue: 'expected Mermaid, draw.io XML, Lucid CSV, or VSDX content',
    },
  ]);
}

function assertFormatCompatible(
  requestedFormat: DiagramInputFormat | 'auto' | undefined,
  detectedFormat: DiagramInputFormat,
): void {
  if (!requestedFormat || requestedFormat === 'auto' || requestedFormat === detectedFormat) {
    return;
  }

  throw new ApiValidationError('Diagram format does not match the uploaded content', [
    {
      field: 'inputFormat',
      issue: `requested ${requestedFormat}, detected ${detectedFormat}`,
    },
  ]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
