import { inflateRawSync } from 'node:zlib';
import { ApiValidationError } from '../api/api-errors';
import { DIAGRAM_INFLATED_MAX_BYTES } from './diagram-parser.types';
import { assertInflatedPayloadSafe } from './diagram-security';

export interface ZipEntryContent {
  path: string;
  content: Buffer;
}

interface CentralDirectoryEntry {
  path: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const MAX_CENTRAL_DIRECTORY_SCAN_BYTES = 66_000;

export function readZipEntries(buffer: Buffer, wantedPath: RegExp): ZipEntryContent[] {
  const endOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(endOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(endOffset + 16);

  if (centralDirectoryOffset + centralDirectorySize > buffer.length) {
    throw new ApiValidationError('VSDX ZIP central directory is invalid', [
      { field: 'content', issue: 'central directory points outside the upload' },
    ]);
  }

  const entries: CentralDirectoryEntry[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new ApiValidationError('VSDX ZIP central directory is invalid', [
        { field: 'content', issue: `entry ${index + 1} has an invalid signature` },
      ]);
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const pathLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const path = buffer.subarray(offset + 46, offset + 46 + pathLength).toString('utf8');

    entries.push({
      path,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    offset += 46 + pathLength + extraLength + commentLength;
  }

  const selected = entries.filter((entry) => wantedPath.test(entry.path));
  const totalUncompressed = selected.reduce((total, entry) => total + entry.uncompressedSize, 0);

  if (totalUncompressed > DIAGRAM_INFLATED_MAX_BYTES) {
    throw new ApiValidationError('VSDX expands beyond the safe parsing limit', [
      { field: 'content', issue: `uncompressed XML totals ${totalUncompressed} bytes` },
    ]);
  }

  return selected.map((entry) => ({
    path: entry.path,
    content: readLocalEntry(buffer, entry),
  }));
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  if (buffer.length < 22) {
    throw new ApiValidationError('VSDX ZIP end marker was not found', [
      { field: 'content', issue: 'upload is too small to be a valid ZIP file' },
    ]);
  }

  const minOffset = Math.max(0, buffer.length - MAX_CENTRAL_DIRECTORY_SCAN_BYTES);

  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }

  throw new ApiValidationError('VSDX ZIP end marker was not found', [
    { field: 'content', issue: 'missing end-of-central-directory record' },
  ]);
}

function readLocalEntry(buffer: Buffer, entry: CentralDirectoryEntry): Buffer {
  const offset = entry.localHeaderOffset;

  if (buffer.readUInt32LE(offset) !== LOCAL_FILE_SIGNATURE) {
    throw new ApiValidationError('VSDX ZIP local file header is invalid', [
      { field: 'content', issue: `${entry.path} has an invalid local header` },
    ]);
  }

  const pathLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataOffset = offset + 30 + pathLength + extraLength;
  const dataEnd = dataOffset + entry.compressedSize;

  if (dataEnd > buffer.length) {
    throw new ApiValidationError('VSDX ZIP entry points outside the upload', [
      { field: 'content', issue: `${entry.path} is truncated` },
    ]);
  }

  const compressed = buffer.subarray(dataOffset, dataEnd);

  if (entry.compressionMethod === 0) {
    return compressed;
  }

  if (entry.compressionMethod !== 8) {
    throw new ApiValidationError('VSDX ZIP uses an unsupported compression method', [
      { field: 'content', issue: `${entry.path} method ${entry.compressionMethod}` },
    ]);
  }

  const inflated = inflateRawSync(compressed, {
    maxOutputLength: Math.min(DIAGRAM_INFLATED_MAX_BYTES, entry.uncompressedSize + 1),
  });
  assertInflatedPayloadSafe(compressed.length, inflated.length, entry.path);

  if (inflated.length !== entry.uncompressedSize) {
    throw new ApiValidationError('VSDX ZIP entry size metadata is inconsistent', [
      { field: 'content', issue: `${entry.path} inflated to an unexpected size` },
    ]);
  }

  return inflated;
}
