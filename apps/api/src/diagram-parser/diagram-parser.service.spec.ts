/* eslint-disable security/detect-non-literal-fs-filename -- Reviewed 2026-07-06: diagram fixture reads are resolved from repository-controlled generated fixtures; see docs/SECURITY-SUPPRESSIONS.md. */
import { describe, it, expect, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { ApiValidationError } from '../api/api-errors.js';
import { ApiRateLimitService } from '../api/rate-limit.service.js';
import { AppConfig } from '../config/config.schema.js';
import { AliasDictionary } from './alias-dictionary.js';
import { DiagramImportRepository } from './diagram-import.repository.js';
import { DiagramParserController } from './diagram-parser.controller.js';
import { DiagramParserService } from './diagram-parser.service.js';
import { DiagramTempFileStore } from './diagram-temp-file.store.js';
import { DrawioExtractor } from './drawio.extractor.js';
import { FormatDetectorService } from './format-detector.service.js';
import { LucidCsvExtractor } from './lucid-csv.extractor.js';
import { MermaidExtractor } from './mermaid.extractor.js';
import { NodeClassifierService } from './node-classifier.service.js';
import { StencilMapRegistry } from './stencil-map.registry.js';
import { VsdxExtractor } from './vsdx.extractor.js';
import { LlmClassifierClient } from './diagram-parser.types.js';
import { DomainMetricsService } from '../observability/domain-metrics.service.js';
import { MetricsService } from '../observability/metrics.service.js';

const fixtureRoot = resolve(import.meta.dirname, '../../../../fixtures/diagrams');

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

  it('summarizes diagram fixture corpus classification tiers by format', async () => {
    const parser = service();
    const summary = new Map<string, DiagramCorpusSummary>();

    for (const fixture of diagramCorpusFixtures) {
      const parsed = await parser.parse({
        content:
          fixture.encoding === 'base64'
            ? readBinaryFixture(fixture.path).toString('base64')
            : readTextFixture(fixture.path),
        ...(fixture.encoding === 'base64' ? { encoding: 'base64' as const } : {}),
        fileName: fixture.path,
        inputFormat: 'auto',
      });

      addDiagramCorpusSummary(summary, parsed);
    }

    expect(summary.get('mermaid')).toEqual({
      fixtures: 3,
      graphNodes: 16,
      components: 12,
      tier1: 0,
      tier2: 12,
      tier3: 0,
      unresolved: 4,
      ignored: 0,
    });
    expect(summary.get('drawio')).toEqual({
      fixtures: 3,
      graphNodes: 11,
      components: 10,
      tier1: 8,
      tier2: 2,
      tier3: 0,
      unresolved: 1,
      ignored: 0,
    });
    expect(summary.get('lucid_csv')).toEqual({
      fixtures: 1,
      graphNodes: 5,
      components: 4,
      tier1: 4,
      tier2: 0,
      tier3: 0,
      unresolved: 1,
      ignored: 0,
    });
    expect(summary.get('vsdx')).toEqual({
      fixtures: 1,
      graphNodes: 3,
      components: 3,
      tier1: 3,
      tier2: 0,
      tier3: 0,
      unresolved: 0,
      ignored: 0,
    });
  });

  it('extracts layout and visual metadata from VSDX shape cells', () => {
    const extracted = new VsdxExtractor().extract({
      buffer: zipWithStoredEntry(
        'visio/pages/page1.xml',
        `
          <PageContents>
            <PageSheet>
              <Cell N="PageWidth" V="10"/>
              <Cell N="PageHeight" V="20"/>
            </PageSheet>
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
        pageId: 'page1',
        pageName: 'Page 1',
        pageWidth: 10,
        pageHeight: 20,
        fillColor: '#D85A30',
        lineColor: '#378ADD',
        normalizedBounds: {
          x: 10,
          y: 10,
          width: 40,
          height: 30,
        },
        geometryHint: 'rectangle',
        renderingMode: 'layout-extraction',
        renderingWarnings: ['layout extraction is not full Visio visual rendering'],
      },
    });
  });

  it('resolves VSDX masters, containers, connector waypoints, and multiple pages', () => {
    const extracted = new VsdxExtractor().extract({
      buffer: zipWithStoredEntries([
        {
          path: 'visio/masters/master1.xml',
          content: `
            <Master ID="1" NameU="AWS19.EC2">
              <Shapes><Shape ID="100" NameU="AWS19.EC2"><Text>EC2 master</Text></Shape></Shapes>
            </Master>
          `,
        },
        {
          path: 'visio/pages/page1.xml',
          content: `
            <PageContents>
              <PageSheet>
                <Cell N="PageWidth" V="10"/>
                <Cell N="PageHeight" V="20"/>
              </PageSheet>
              <Shapes>
                <Shape ID="10" Master="1" Parent="99">
                  <Text>web tier</Text>
                  <Cell N="PinX" V="3"/>
                  <Cell N="PinY" V="5"/>
                  <Cell N="Width" V="4"/>
                  <Cell N="Height" V="6"/>
                </Shape>
                <Shape ID="20" NameU="AWS19.RDS"><Text>database</Text></Shape>
                <Shape ID="30" NameU="Connector"><Text>route</Text></Shape>
              </Shapes>
              <Connects>
                <Connect FromSheet="30" ToSheet="10"/>
                <Connect FromSheet="30" ToSheet="20"/>
              </Connects>
            </PageContents>
          `,
        },
        {
          path: 'visio/pages/page2.xml',
          content: `
            <PageContents>
              <Shapes>
                <Shape ID="40" NameU="AWS19.S3"><Text>archive bucket</Text></Shape>
              </Shapes>
            </PageContents>
          `,
        },
      ]),
      sizeBytes: 1,
      sha256: 'hash',
      detectedFormat: 'vsdx',
    });

    expect(extracted.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '10',
          stencilId: 'AWS19.EC2',
          visual: expect.objectContaining({
            pageName: 'Page 1',
            masterId: '1',
            masterName: 'AWS19.EC2',
            containerId: '99',
          }),
        }),
        expect.objectContaining({
          id: '40',
          visual: expect.objectContaining({
            pageName: 'Page 2',
          }),
        }),
      ]),
    );
    expect(extracted.edges).toEqual([
      expect.objectContaining({
        sourceId: '10',
        targetId: '20',
        displayLabel: 'Connector',
      }),
    ]);
  });

  it('carries VSDX page, master, and container context into review evidence', async () => {
    const parsed = await service().parse({
      content: zipWithStoredEntries([
        {
          path: 'visio/masters/master1.xml',
          content: `
            <Master ID="1" NameU="AWS19.EC2">
              <Shapes><Shape ID="100" NameU="AWS19.EC2"><Text>EC2 master</Text></Shape></Shapes>
            </Master>
          `,
        },
        {
          path: 'visio/pages/page1.xml',
          content: `
            <PageContents>
              <PageSheet>
                <Cell N="PageWidth" V="10"/>
                <Cell N="PageHeight" V="20"/>
              </PageSheet>
              <Shapes>
                <Shape ID="10" Master="1" Parent="99">
                  <Text>web tier</Text>
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
        },
      ]).toString('base64'),
      encoding: 'base64',
      fileName: 'evidence.vsdx',
    });

    expect(parsed.review.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: '10',
          serviceCategory: 'compute',
          serviceType: 'vm-compute',
          evidence: expect.stringContaining('Matched stencil "AWS19.EC2" -> vm-compute'),
        }),
      ]),
    );
    const component = parsed.review.components.find((item) => item.nodeId === '10');
    expect(component?.evidence).toContain('Visio page Page 1');
    expect(component?.evidence).toContain('Visio master AWS19.EC2');
    expect(component?.evidence).toContain('container 99');
    expect(component?.evidence).toContain('Visio page size w=10 h=20');
    expect(component?.evidence).toContain('Visio bounds x=1 y=2 w=4 h=6');
    expect(component?.evidence).toContain('Visio preview box x=10% y=10% w=40% h=30%');
    expect(component?.evidence).toContain('Visio geometry rectangle');
    expect(component?.evidence).toContain('Visio style fill #D85A30 line #378ADD');
    expect(component?.evidence).toContain(
      'Visio rendering layout-extraction; layout extraction is not full Visio visual rendering',
    );
  });

  it('emits sanitized approximate SVG visual previews for VSDX pages', async () => {
    const parsed = await service().parse({
      content: zipWithStoredEntries([
        {
          path: 'visio/pages/page1.xml',
          content: `
            <PageContents>
              <PageSheet>
                <Cell N="PageWidth" V="12"/>
                <Cell N="PageHeight" V="8"/>
              </PageSheet>
              <Shapes>
                <Shape ID="10" NameU="AWS19.EC2">
                  <Text>EC2 &lt;web&gt;</Text>
                  <Cell N="PinX" V="3"/>
                  <Cell N="PinY" V="5"/>
                  <Cell N="Width" V="2"/>
                  <Cell N="Height" V="1"/>
                  <Cell N="FillForegnd" V="#D85A30"/>
                </Shape>
                <Shape ID="20" NameU="AWS19.RDS">
                  <Text>database</Text>
                  <Cell N="PinX" V="8"/>
                  <Cell N="PinY" V="3"/>
                  <Cell N="Width" V="2"/>
                  <Cell N="Height" V="1"/>
                  <Cell N="LineColor" V="RGB(29,158,117)"/>
                </Shape>
                <Shape ID="30" NameU="Connector"><Text>route</Text></Shape>
              </Shapes>
              <Connects>
                <Connect FromSheet="30" ToSheet="10"/>
                <Connect FromSheet="30" ToSheet="20"/>
              </Connects>
            </PageContents>
          `,
        },
      ]).toString('base64'),
      encoding: 'base64',
      fileName: 'preview.vsdx',
    });

    expect(parsed.graph.visualPreviews).toHaveLength(1);
    expect(parsed.graph.visualPreviews?.[0]).toEqual(
      expect.objectContaining({
        format: 'svg',
        renderingMode: 'approximate-vsdx-svg',
        pageRef: 'visio/pages/page1.xml',
        pageName: 'Page 1',
        nodeCount: 2,
        edgeCount: 1,
        warnings: expect.arrayContaining([
          'approximate SVG preview from VSDX geometry, not full Visio visual rendering',
        ]),
      }),
    );
    const svg = parsed.graph.visualPreviews?.[0]?.svg ?? '';
    expect(svg).toContain('<svg');
    expect(svg).toContain('data-node-id="10"');
    expect(svg).toContain('data-node-id="20"');
    expect(svg).toContain('data-edge-id=');
    expect(svg).toContain('>EC2<');
    expect(svg).not.toContain('<web>');
    expect(svg).not.toContain('<script');
  });

  it('uses VSDX page names and container labels as review and region evidence', async () => {
    const parsed = await service().parse({
      content: zipWithStoredEntries([
        {
          path: 'visio/pages/pages.xml',
          content: `
            <Pages>
              <Page ID="0" Name="Application us-east-1">
                <Rel r:id="rId1"/>
              </Page>
            </Pages>
          `,
        },
        {
          path: 'visio/pages/_rels/pages.xml.rels',
          content: `
            <Relationships>
              <Relationship Id="rId1" Target="page1.xml"/>
            </Relationships>
          `,
        },
        {
          path: 'visio/masters/master1.xml',
          content: `
            <Master ID="1" NameU="AWS19.EC2">
              <Shapes><Shape ID="100" NameU="AWS19.EC2"><Text>EC2 master</Text></Shape></Shapes>
            </Master>
          `,
        },
        {
          path: 'visio/pages/page1.xml',
          content: `
            <PageContents>
              <Shapes>
                <Shape ID="99" NameU="Container"><Text>Production VPC us-east-1</Text></Shape>
                <Shape ID="10" Master="1" Parent="99"><Text>web tier</Text></Shape>
              </Shapes>
            </PageContents>
          `,
        },
      ]).toString('base64'),
      encoding: 'base64',
      fileName: 'named-container.vsdx',
    });

    const component = parsed.review.components.find((item) => item.nodeId === '10');
    const graphNode = parsed.graph.nodes.find((node) => node.id === '10');

    expect(graphNode?.visual).toEqual(
      expect.objectContaining({
        pageName: 'Application us-east-1',
        containerId: '99',
        containerLabel: 'Production VPC us-east-1',
      }),
    );
    expect(component?.evidence).toContain('Visio page Application us-east-1');
    expect(component?.evidence).toContain('container 99 (Production VPC us-east-1)');
    expect(parsed.draftNws.workload.region.preference).toBe('us-east-1');
    expect(parsed.draftNws.workload.region.isDefault).toBe(false);
  });

  it('keeps valid VSDX pages and reports page-level warnings for corrupt pages', async () => {
    const parsed = await service().parse({
      content: zipWithStoredEntries([
        {
          path: 'visio/pages/page1.xml',
          content: `
            <PageContents>
              <Shapes>
                <Shape ID="10" NameU="AWS19.EC2"><Text>EC2 web</Text></Shape>
              </Shapes>
            </PageContents>
          `,
        },
        {
          path: 'visio/pages/page2.xml',
          content: `
            <PageContents>
              <Shapes>
                <Shape ID="20" NameU="AWS19.RDS"><Text>broken database</Text></Shape>
              </Shapes>
          `,
        },
      ]).toString('base64'),
      encoding: 'base64',
      fileName: 'partial.vsdx',
    });

    expect(parsed.graph.format).toBe('vsdx');
    expect(parsed.review.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayLabel: 'EC2 web',
          serviceCategory: 'compute',
        }),
      ]),
    );
    expect(parsed.review.unresolvedClassifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'vsdx-page-parse-error-page2',
          displayLabel: 'Page 2',
          reason: expect.stringContaining('Unable to parse Page 2'),
          sourceRef: 'vsdx:visio_pages_page2.xml:parse-error',
        }),
      ]),
    );
    expect(parsed.fieldsRequiringReview).toContain(
      'diagram.extraction.vsdx-page-parse-error-page2',
    );
  });

  it('still rejects unsafe VSDX XML instead of downgrading it to a parse warning', async () => {
    await expect(
      service().parse({
        content: zipWithStoredEntries([
          {
            path: 'visio/pages/page1.xml',
            content: `
              <PageContents>
                <Shapes>
                  <Shape ID="10" NameU="AWS19.EC2"><Text>EC2 web</Text></Shape>
                </Shapes>
              </PageContents>
            `,
          },
          {
            path: 'visio/pages/page2.xml',
            content: `
              <!DOCTYPE foo [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>
              <PageContents>
                <Shapes>
                  <Shape ID="20" NameU="AWS19.RDS"><Text>&xxe;</Text></Shape>
                </Shapes>
              </PageContents>
            `,
          },
        ]).toString('base64'),
        encoding: 'base64',
        fileName: 'unsafe.vsdx',
      }),
    ).rejects.toThrow(ApiValidationError);
  });

  it('classifies unresolved nodes through the mocked Tier 3 LLM path', async () => {
    const llmClient: LlmClassifierClient = {
      classify: jest.fn<LlmClassifierClient['classify']>(async (input) => ({
        serviceCategory: 'integration',
        serviceType: 'queue-or-event-bus',
        confidence: 'low',
        reason: `LLM classification, confidence low for ${input.displayLabel}`,
        assumedDefaults: ['1 million messages per month'],
        serviceRequirement: {
          serviceCategory: 'integration',
          serviceType: 'queue-or-event-bus',
          quantity: 1,
          scaleParams: {
            classifier: 'llm',
            diagramNodeId: input.diagramNodeId ?? 'unknown',
          },
        },
      })),
    };

    const parsed = await service(llmClient).parse({
      content: 'graph TD\n  A[Unmapped async processor]',
      fileName: 'custom.mmd',
      inputFormat: 'mermaid',
    });

    expect(llmClient.classify).toHaveBeenCalledWith(
      expect.objectContaining({
        displayLabel: 'Unmapped async processor',
      }),
    );
    expect(parsed.review.components[0]).toMatchObject({
      serviceCategory: 'integration',
      serviceType: 'queue-or-event-bus',
      evidence: expect.stringContaining('LLM classification'),
    });
  });

  it('batches unresolved nodes through the Tier 3 LLM client when available', async () => {
    const llmClient: LlmClassifierClient = {
      classify: jest.fn<LlmClassifierClient['classify']>(),
      classifyBatch: jest.fn<NonNullable<LlmClassifierClient['classifyBatch']>>(async (inputs) =>
        inputs.map((input) => ({
          serviceCategory: 'integration',
          serviceType: 'queue-or-event-bus',
          confidence: 'low',
          reason: `LLM classification, confidence low for ${input.displayLabel}`,
          assumedDefaults: ['1 million messages per month'],
          serviceRequirement: {
            serviceCategory: 'integration',
            serviceType: 'queue-or-event-bus',
            quantity: 1,
            scaleParams: {
              classifier: 'llm',
              diagramNodeId: input.diagramNodeId ?? 'unknown',
            },
          },
        })),
      ),
    };

    const parsed = await service(llmClient).parse({
      content: 'graph TD\n  A[Quasar alpha]\n  B[Quasar beta]\n  C[EC2 web]',
      fileName: 'batched-custom.mmd',
      inputFormat: 'mermaid',
    });

    expect(llmClient.classifyBatch).toHaveBeenCalledTimes(1);
    expect(llmClient.classifyBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        displayLabel: 'Quasar alpha',
        diagramNodeId: 'A',
      }),
      expect.objectContaining({
        displayLabel: 'Quasar beta',
        diagramNodeId: 'B',
      }),
    ]);
    expect(llmClient.classify).not.toHaveBeenCalled();
    expect(parsed.review.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'A',
          serviceCategory: 'integration',
          evidence: expect.stringContaining('LLM classification'),
        }),
        expect.objectContaining({
          nodeId: 'C',
          serviceCategory: 'compute',
          evidence: expect.stringContaining('Label matched alias'),
        }),
      ]),
    );
  });

  it('surfaces Tier 3 LLM fallback diagnostics on unresolved review rows', async () => {
    const llmClient: LlmClassifierClient = {
      classify: jest.fn<LlmClassifierClient['classify']>(async () => undefined),
      lastFailureReason: jest.fn<NonNullable<LlmClassifierClient['lastFailureReason']>>(
        () => 'Tier 3 LLM classifier request failed or timed out',
      ),
    };

    const parsed = await service(llmClient).parse({
      content: 'graph TD\n  A[Mystery foobar node]',
      fileName: 'custom.mmd',
      inputFormat: 'mermaid',
    });

    expect(parsed.review.unresolvedClassifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayLabel: 'Mystery foobar node',
          reason: 'no service alias matched; Tier 3 LLM classifier request failed or timed out',
        }),
      ]),
    );
    expect(parsed.fieldsRequiringReview).toContain('diagram.nodes.A.classification');
  });

  it('caps Tier 3 LLM classifier calls per parse and leaves overflow nodes reviewable', async () => {
    const llmClient: LlmClassifierClient = {
      classify: jest.fn<LlmClassifierClient['classify']>(async (input) => ({
        serviceCategory: 'integration',
        serviceType: 'queue-or-event-bus',
        confidence: 'low',
        reason: `LLM classification, confidence low for ${input.displayLabel}`,
        assumedDefaults: [],
        serviceRequirement: {
          serviceCategory: 'integration',
          serviceType: 'queue-or-event-bus',
          quantity: 1,
          scaleParams: {
            classifier: 'llm',
            diagramNodeId: input.diagramNodeId ?? 'unknown',
          },
        },
      })),
    };
    const content = [
      'graph TD',
      ...Array.from({ length: 25 }, (_, index) => `  U${index}[Opaque custom tier ${index}]`),
    ].join('\n');

    const parsed = await service(llmClient).parse({
      content,
      fileName: 'many-unknowns.mmd',
      inputFormat: 'mermaid',
    });

    expect(llmClient.classify).toHaveBeenCalledTimes(20);
    expect(parsed.review.components).toHaveLength(20);
    expect(parsed.review.unresolvedClassifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayLabel: 'Opaque custom tier 20',
          reason: 'Tier 3 LLM classifier cost guard skipped after 20 unresolved nodes',
        }),
      ]),
    );
    expect(parsed.fieldsRequiringReview).toContain('diagram.nodes.U20.classification');
  });

  it('caps oversized diagrams at 200 parsed nodes with a review warning', async () => {
    const content = [
      'graph TD',
      ...Array.from({ length: 205 }, (_, index) => `  N${index}[EC2 worker ${index}]`),
    ].join('\n');

    const parsed = await service().parse({
      content,
      fileName: 'large.mmd',
      inputFormat: 'mermaid',
    });

    expect(parsed.graph.nodes).toHaveLength(200);
    expect(parsed.review.unresolvedClassifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'diagram-node-cap',
          reason: 'diagram contains 205 nodes; parsed first 200',
        }),
      ]),
    );
    expect(parsed.fieldsRequiringReview).toContain('diagram.nodes.cap');
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
      save: jest.fn<DiagramImportRepository['save']>(async () => {
        throw new Error('db unavailable');
      }),
    } as unknown as DiagramImportRepository;
    const tempFileStore = {
      store: jest.fn<DiagramTempFileStore['store']>(async () => ({
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

interface DiagramCorpusFixture {
  path: string;
  encoding?: 'base64';
}

const diagramCorpusFixtures: DiagramCorpusFixture[] = [
  { path: 'mermaid/web-app.mmd' },
  { path: 'mermaid/data-platform.mmd' },
  { path: 'mermaid/ml-platform.mmd' },
  { path: 'drawio/web-app.drawio' },
  { path: 'drawio/gcp-api.drawio' },
  { path: 'drawio/analytics.drawio' },
  { path: 'lucid/lucid-export.csv' },
  { path: 'vsdx/simple.vsdx', encoding: 'base64' as const },
];

interface DiagramCorpusSummary {
  fixtures: number;
  graphNodes: number;
  components: number;
  tier1: number;
  tier2: number;
  tier3: number;
  unresolved: number;
  ignored: number;
}

type ParsedDiagram = Awaited<ReturnType<DiagramParserService['parse']>>;

function addDiagramCorpusSummary(
  summary: Map<string, DiagramCorpusSummary>,
  parsed: ParsedDiagram,
): void {
  const current = summary.get(parsed.graph.format) ?? {
    fixtures: 0,
    graphNodes: 0,
    components: 0,
    tier1: 0,
    tier2: 0,
    tier3: 0,
    unresolved: 0,
    ignored: 0,
  };

  current.fixtures += 1;
  current.graphNodes += parsed.graph.nodes.length;
  current.components += parsed.review.components.length;
  current.unresolved += parsed.review.unresolvedClassifications.length;
  current.ignored += parsed.review.ignoredNodes.length;

  for (const component of parsed.review.components) {
    const tier = classificationTier(component.evidence);

    if (tier === 1) {
      current.tier1 += 1;
    } else if (tier === 2) {
      current.tier2 += 1;
    } else {
      current.tier3 += 1;
    }
  }

  summary.set(parsed.graph.format, current);
}

function classificationTier(evidence: string): 1 | 2 | 3 {
  if (evidence.startsWith('Matched stencil')) {
    return 1;
  }

  if (evidence.startsWith('Label matched alias')) {
    return 2;
  }

  return 3;
}

function service(llmClassifierClient?: LlmClassifierClient): DiagramParserService {
  const aliasDictionary = new AliasDictionary();

  return new DiagramParserService(
    new FormatDetectorService(),
    new NodeClassifierService(
      new StencilMapRegistry(aliasDictionary),
      aliasDictionary,
      llmClassifierClient,
    ),
    new MermaidExtractor(),
    new DrawioExtractor(),
    new LucidCsvExtractor(),
    new VsdxExtractor(),
  );
}

function configService(): ConfigService<AppConfig, true> {
  return {
    get: jest.fn<ConfigService['get']>(() => 2),
  } as unknown as ConfigService<AppConfig, true>;
}

function readTextFixture(path: string): string {
  return readBinaryFixture(path).toString('utf8');
}

function readBinaryFixture(path: string): Buffer {
  return readFileSync(resolve(fixtureRoot, path));
}

function zipWithStoredEntry(path: string, content: string): Buffer {
  return zipWithStoredEntries([{ path, content }]);
}

function zipWithStoredEntries(entries: Array<{ path: string; content: string }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const pathBuffer = Buffer.from(entry.path);
    const contentBuffer = Buffer.from(entry.content);
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
    centralDirectory.writeUInt32LE(localOffset, 42);

    const localPart = Buffer.concat([localHeader, pathBuffer, contentBuffer]);
    localParts.push(localPart);
    centralParts.push(centralDirectory, pathBuffer);
    localOffset += localPart.length;
  }

  const centralDirectoryOffset = localOffset;
  const centralDirectoryContent = Buffer.concat(centralParts);
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(entries.length, 8);
  endOfCentralDirectory.writeUInt16LE(entries.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectoryContent.length, 12);
  endOfCentralDirectory.writeUInt32LE(centralDirectoryOffset, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectoryContent, endOfCentralDirectory]);
}

describe('DiagramParserService metrics', () => {
  function instrumented() {
    const aliasDictionary = new AliasDictionary();
    const metrics = new MetricsService({ collectDefaults: false });

    return {
      render: () => metrics.render(),
      parser: new DiagramParserService(
        new FormatDetectorService(),
        new NodeClassifierService(new StencilMapRegistry(aliasDictionary), aliasDictionary),
        new MermaidExtractor(),
        new DrawioExtractor(),
        new LucidCsvExtractor(),
        new VsdxExtractor(),
        new DomainMetricsService(metrics),
      ),
    };
  }

  it('records the detected format and parser confidence', async () => {
    const { parser, render } = instrumented();

    const parsed = await parser.parse({
      content: readTextFixture('mermaid/web-app.mmd'),
      fileName: 'mermaid/web-app.mmd',
      inputFormat: 'auto',
    });

    expect(await render()).toContain(
      `diagram_parses_total{format="mermaid",confidence="${parsed.parserConfidence}"} 1`,
    );
  });

  it('keeps series bounded across many parses of different files', async () => {
    const { parser, render } = instrumented();

    for (let i = 0; i < 5; i += 1) {
      await parser.parse({
        content: readTextFixture('mermaid/web-app.mmd'),
        // A distinct file name per parse: this must not become a label.
        fileName: `upload-${i}.mmd`,
        inputFormat: 'auto',
      });
    }

    const rendered = await render();
    const series = rendered.split('\n').filter((line) => line.startsWith('diagram_parses_total{'));

    expect(series).toHaveLength(1);
    expect(rendered).not.toContain('upload-3.mmd');
  });
});
