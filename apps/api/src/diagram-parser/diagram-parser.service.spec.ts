import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { ApiValidationError } from '../api/api-errors';
import { ApiRateLimitService } from '../api/rate-limit.service';
import { AppConfig } from '../config/config.schema';
import { AliasDictionary } from './alias-dictionary';
import { DiagramImportRepository } from './diagram-import.repository';
import { DiagramParserController } from './diagram-parser.controller';
import { DiagramParserService } from './diagram-parser.service';
import { DiagramTempFileStore } from './diagram-temp-file.store';
import { DrawioExtractor } from './drawio.extractor';
import { FormatDetectorService } from './format-detector.service';
import { LucidCsvExtractor } from './lucid-csv.extractor';
import { MermaidExtractor } from './mermaid.extractor';
import { NodeClassifierService } from './node-classifier.service';
import { StencilMapRegistry } from './stencil-map.registry';
import { VsdxExtractor } from './vsdx.extractor';

const fixtureRoot = resolve(__dirname, '../../../../fixtures/diagrams');

describe('DiagramParserService', () => {
  it.each([
    ['mermaid', 'mermaid/web-app.mmd', 'mermaid'],
    ['draw.io', 'drawio/gcp-api.drawio', 'drawio'],
    ['Lucid CSV', 'lucid/lucid-export.csv', 'lucid_csv'],
  ])('parses %s fixtures into reviewable NWS drafts', async (_label, fixturePath, format) => {
    const parsed = await service().parse({
      content: readTextFixture(fixturePath),
      fileName: fixturePath,
      inputFormat: 'auto',
    });

    expect(parsed.graph.format).toBe(format);
    expect(parsed.review.components.length).toBeGreaterThan(0);
    expect(parsed.draftNws.schemaVersion).toBe('1.0');
    expect(parsed.draftNws.serviceRequirements?.length).toBeGreaterThan(0);
  });

  it('parses VSDX OpenXML fixtures from base64 payloads', async () => {
    const parsed = await service().parse({
      content: readBinaryFixture('vsdx/simple.vsdx').toString('base64'),
      encoding: 'base64',
      fileName: 'simple.vsdx',
    });

    expect(parsed.graph.format).toBe('vsdx');
    expect(parsed.review.components.map((component) => component.serviceCategory)).toContain(
      'compute',
    );
    expect(parsed.graph.nodes.some((node) => node.visual?.pageRef)).toBe(true);
    expect(parsed.draftNws.database).toHaveLength(1);
  });

  it('extracts layout and visual metadata from VSDX shape cells', () => {
    const extracted = new VsdxExtractor().extract({
      buffer: zipWithStoredEntry(
        'visio/pages/page1.xml',
        `
          <PageContents>
            <Shapes>
              <Shape ID="7" NameU="EC2">
                <Text>EC2 web</Text>
                <Cell N="PinX" V="3"/>
                <Cell N="PinY" V="5"/>
                <Cell N="Width" V="4"/>
                <Cell N="Height" V="6"/>
                <Cell N="FillForegnd" V="#D85A30"/>
                <Cell N="LineColor" V="RGB(55,138,221)"/>
              </Shape>
            </Shapes>
          </PageContents>
        `,
      ),
      sizeBytes: 1,
      sha256: 'hash',
      detectedFormat: 'vsdx',
    });

    expect(extracted.nodes[0]).toMatchObject({
      id: '7',
      rawLabel: 'EC2 web',
      bounds: {
        x: 1,
        y: 2,
        width: 4,
        height: 6,
      },
      visual: {
        pageRef: 'visio/pages/page1.xml',
        pageName: 'Page 1',
        fillColor: '#D85A30',
        lineColor: '#378ADD',
      },
    });
  });

  it.each([
    ['XXE XML', 'malicious/xxe.drawio', 'drawio'],
    ['deflate bomb', 'malicious/deflate-bomb.drawio', 'drawio'],
    ['oversized upload', 'malicious/oversized.drawio', 'drawio'],
    ['PNG renamed as draw.io', 'malicious/png-renamed.drawio', 'drawio'],
  ])('rejects malicious %s fixtures', async (_label, fixturePath, inputFormat) => {
    const content =
      fixturePath === 'malicious/png-renamed.drawio'
        ? readBinaryFixture(fixturePath).toString('base64')
        : readTextFixture(fixturePath);

    await expect(
      service().parse({
        content,
        encoding: fixturePath === 'malicious/png-renamed.drawio' ? 'base64' : 'text',
        fileName: fixturePath,
        inputFormat: inputFormat as never,
      }),
    ).rejects.toThrow(ApiValidationError);
  });

  it.each([
    ['JPEG image', Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'image.drawio'],
    ['GIF image', Buffer.from('GIF89a'), 'image.drawio'],
    ['PDF document', Buffer.from('%PDF-1.7'), 'diagram.drawio'],
  ])(
    'rejects unsupported binary %s uploads before extraction',
    async (_label, payload, fileName) => {
      await expect(
        service().parse({
          content: payload.toString('base64'),
          encoding: 'base64',
          fileName,
        }),
      ).rejects.toThrow(ApiValidationError);
    },
  );

  it('rejects compressed VSDX expansion bombs below the upload-size limit', async () => {
    await expect(
      service().parse({
        content: readBinaryFixture('malicious/zip-bomb.vsdx').toString('base64'),
        encoding: 'base64',
        fileName: 'zip-bomb.vsdx',
      }),
    ).rejects.toThrow(ApiValidationError);
  });
});

describe('DiagramParserController', () => {
  it('returns parser metadata and keeps responding when import persistence is unavailable', async () => {
    const repository = {
      save: jest.fn(async () => {
        throw new Error('db unavailable');
      }),
    } as unknown as DiagramImportRepository;
    const tempFileStore = {
      store: jest.fn(async () => ({
        fileRef: '77777777-7777-4777-8777-777777777777-random.mmd',
        expiresAt: '2026-07-07T00:00:00.000Z',
      })),
    } as unknown as DiagramTempFileStore;
    const controller = new DiagramParserController(
      service(),
      repository,
      tempFileStore,
      new ApiRateLimitService(() => 0),
      configService(),
    );
    const response = {
      header: jest.fn(),
    };

    const result = await controller.parseDiagram(
      {
        content: readTextFixture('mermaid/web-app.mmd'),
        fileName: 'web-app.mmd',
      },
      { ip: '127.0.0.1', headers: {} },
      response,
    );

    expect(result.source.format).toBe('mermaid');
    expect(result.source.persisted).toBe(false);
    expect(result.source.tempFileStored).toBe(true);
    expect(result.source.expiresAt).toBe('2026-07-07T00:00:00.000Z');
    expect(result.review.components.length).toBeGreaterThan(0);
    expect(tempFileStore.store).toHaveBeenCalledWith(
      expect.objectContaining({
        detectedFormat: 'mermaid',
      }),
      result.importId,
    );
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tempFileRef: '77777777-7777-4777-8777-777777777777-random.mmd',
        expiresAt: '2026-07-07T00:00:00.000Z',
      }),
    );
    expect(response.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '1');
  });
});

function service(): DiagramParserService {
  const aliasDictionary = new AliasDictionary();

  return new DiagramParserService(
    new FormatDetectorService(),
    new NodeClassifierService(new StencilMapRegistry(aliasDictionary), aliasDictionary),
    new MermaidExtractor(),
    new DrawioExtractor(),
    new LucidCsvExtractor(),
    new VsdxExtractor(),
  );
}

function configService(): ConfigService<AppConfig, true> {
  return {
    get: jest.fn(() => 2),
  } as unknown as ConfigService<AppConfig, true>;
}

function readTextFixture(path: string): string {
  return readBinaryFixture(path).toString('utf8');
}

function readBinaryFixture(path: string): Buffer {
  return readFileSync(resolve(fixtureRoot, path));
}

function zipWithStoredEntry(path: string, content: string): Buffer {
  const pathBuffer = Buffer.from(path);
  const contentBuffer = Buffer.from(content);
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 6);
  localHeader.writeUInt16LE(0, 8);
  localHeader.writeUInt32LE(0, 10);
  localHeader.writeUInt32LE(0, 14);
  localHeader.writeUInt32LE(contentBuffer.length, 18);
  localHeader.writeUInt32LE(contentBuffer.length, 22);
  localHeader.writeUInt16LE(pathBuffer.length, 26);
  localHeader.writeUInt16LE(0, 28);

  const centralDirectory = Buffer.alloc(46);
  const centralDirectoryOffset = localHeader.length + pathBuffer.length + contentBuffer.length;
  centralDirectory.writeUInt32LE(0x02014b50, 0);
  centralDirectory.writeUInt16LE(20, 4);
  centralDirectory.writeUInt16LE(20, 6);
  centralDirectory.writeUInt16LE(0, 8);
  centralDirectory.writeUInt16LE(0, 10);
  centralDirectory.writeUInt32LE(0, 12);
  centralDirectory.writeUInt32LE(0, 16);
  centralDirectory.writeUInt32LE(contentBuffer.length, 20);
  centralDirectory.writeUInt32LE(contentBuffer.length, 24);
  centralDirectory.writeUInt16LE(pathBuffer.length, 28);
  centralDirectory.writeUInt16LE(0, 30);
  centralDirectory.writeUInt16LE(0, 32);
  centralDirectory.writeUInt16LE(0, 34);
  centralDirectory.writeUInt16LE(0, 36);
  centralDirectory.writeUInt32LE(0, 38);
  centralDirectory.writeUInt32LE(0, 42);

  const endOfCentralDirectory = Buffer.alloc(22);
  const centralDirectorySize = centralDirectory.length + pathBuffer.length;
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(1, 8);
  endOfCentralDirectory.writeUInt16LE(1, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectorySize, 12);
  endOfCentralDirectory.writeUInt32LE(centralDirectoryOffset, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  return Buffer.concat([
    localHeader,
    pathBuffer,
    contentBuffer,
    centralDirectory,
    pathBuffer,
    endOfCentralDirectory,
  ]);
}
