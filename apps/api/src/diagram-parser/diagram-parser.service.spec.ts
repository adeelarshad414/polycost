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
    expect(parsed.draftNws.database).toHaveLength(1);
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
    const controller = new DiagramParserController(
      service(),
      repository,
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
    expect(result.review.components.length).toBeGreaterThan(0);
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
