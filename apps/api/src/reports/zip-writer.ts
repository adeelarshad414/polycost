interface ZipEntry {
  path: string;
  content: Buffer;
}

interface CentralDirectoryEntry {
  pathBuffer: Buffer;
  content: Buffer;
  crc32: number;
  offset: number;
}

const CRC32_TABLE = createCrc32Table();

export function createZip(entries: ZipEntry[]): Buffer {
  const chunks: Buffer[] = [];
  const centralDirectoryEntries: CentralDirectoryEntry[] = [];
  let offset = 0;

  for (const entry of entries) {
    const pathBuffer = Buffer.from(entry.path, 'utf8');
    const crc32 = calculateCrc32(entry.content);
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc32, 14);
    localHeader.writeUInt32LE(entry.content.length, 18);
    localHeader.writeUInt32LE(entry.content.length, 22);
    localHeader.writeUInt16LE(pathBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    chunks.push(localHeader, pathBuffer, entry.content);
    centralDirectoryEntries.push({
      pathBuffer,
      content: entry.content,
      crc32,
      offset,
    });
    offset += localHeader.length + pathBuffer.length + entry.content.length;
  }

  const centralDirectoryOffset = offset;

  for (const entry of centralDirectoryEntries) {
    const centralHeader = Buffer.alloc(46);

    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(entry.crc32, 16);
    centralHeader.writeUInt32LE(entry.content.length, 20);
    centralHeader.writeUInt32LE(entry.content.length, 24);
    centralHeader.writeUInt16LE(entry.pathBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(entry.offset, 42);

    chunks.push(centralHeader, entry.pathBuffer);
    offset += centralHeader.length + entry.pathBuffer.length;
  }

  const centralDirectorySize = offset - centralDirectoryOffset;
  const endOfCentralDirectory = Buffer.alloc(22);

  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(centralDirectoryEntries.length, 8);
  endOfCentralDirectory.writeUInt16LE(centralDirectoryEntries.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectorySize, 12);
  endOfCentralDirectory.writeUInt32LE(centralDirectoryOffset, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  chunks.push(endOfCentralDirectory);

  return Buffer.concat(chunks);
}

function calculateCrc32(buffer: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function createCrc32Table(): number[] {
  const table: number[] = [];

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table.push(value >>> 0);
  }

  return table;
}
