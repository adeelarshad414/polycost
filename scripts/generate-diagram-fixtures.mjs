import { deflateRawSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const root = new URL('../fixtures/diagrams/', import.meta.url);
const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});

writeBinary(
  'vsdx/simple.vsdx',
  createZip([
    {
      path: 'visio/pages/page1.xml',
      content: Buffer.from(
        `<PageContents>
        <Shapes>
          <Shape ID="1" NameU="Cloud Load Balancer"><Text>Azure Load Balancer</Text></Shape>
          <Shape ID="2" NameU="Virtual Machine"><Text>2x virtual machines 4 vCPU 16GB</Text></Shape>
          <Shape ID="3" NameU="Database"><Text>SQL Server database 300GB</Text></Shape>
        </Shapes>
        <Connects>
          <Connect FromSheet="1" ToSheet="2"/>
          <Connect FromSheet="2" ToSheet="3"/>
        </Connects>
      </PageContents>`,
      ),
    },
  ]),
);

const deflateBombPayload = encodeURIComponent('A'.repeat(700 * 1024));
const deflateBomb = deflateRawSync(Buffer.from(deflateBombPayload));
writeText(
  'malicious/deflate-bomb.drawio',
  `<mxfile><diagram id="bomb">${deflateBomb.toString('base64')}</diagram></mxfile>`,
);

writeBinary(
  'malicious/zip-bomb.vsdx',
  createZip([
    {
      path: 'visio/pages/page1.xml',
      content: Buffer.from('<PageContents>' + 'A'.repeat(6 * 1024 * 1024) + '</PageContents>'),
      compress: true,
    },
  ]),
);

writeBinary(
  'malicious/png-renamed.drawio',
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]),
);

writeText('malicious/oversized.drawio', '<mxfile>' + 'x'.repeat(6 * 1024 * 1024) + '</mxfile>');

function writeText(path, content) {
  writeBinary(path, Buffer.from(content, 'utf8'));
}

function writeBinary(path, content) {
  const url = new URL(path, root);
  mkdirSync(dirname(url.pathname), { recursive: true });
  writeFileSync(url, content);
}

function createZip(entries) {
  const chunks = [];
  const centralDirectoryEntries = [];
  let offset = 0;

  for (const entry of entries) {
    const pathBuffer = Buffer.from(entry.path, 'utf8');
    const crc32 = calculateCrc32(entry.content);
    const storedContent = entry.compress ? deflateRawSync(entry.content) : entry.content;
    const compressionMethod = entry.compress ? 8 : 0;
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(compressionMethod, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc32, 14);
    localHeader.writeUInt32LE(storedContent.length, 18);
    localHeader.writeUInt32LE(entry.content.length, 22);
    localHeader.writeUInt16LE(pathBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    chunks.push(localHeader, pathBuffer, storedContent);
    centralDirectoryEntries.push({
      pathBuffer,
      content: entry.content,
      storedContent,
      compressionMethod,
      crc32,
      offset,
    });
    offset += localHeader.length + pathBuffer.length + storedContent.length;
  }

  const centralDirectoryOffset = offset;

  for (const entry of centralDirectoryEntries) {
    const centralHeader = Buffer.alloc(46);

    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(entry.compressionMethod, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(entry.crc32, 16);
    centralHeader.writeUInt32LE(entry.storedContent.length, 20);
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

function calculateCrc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}
