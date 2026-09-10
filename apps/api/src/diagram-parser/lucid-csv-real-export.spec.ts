import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { LucidCsvExtractor } from './lucid-csv.extractor.js';

/*
  Lucidchart's actual CSV export, as opposed to a CSV shaped the way the
  extractor happened to expect.

  The existing fixture is hand-written: `Id,Name,Shape,Text,...` with the
  service name in `Name`. A real export has thirteen columns, puts the shape
  TYPE in `Name` - every box comes out as "Process" or "Rectangle" - and the
  visible label in `Text Area 1`. Reading `name` first therefore classified an
  entire real export as nothing at all, while the synthetic fixture passed.

  Same failure mode as the pricing resolvers: correct against a fixture built
  to match the code, wrong against the format the tool actually emits.
*/

const FIXTURE = path.join(process.cwd(), '../../fixtures/diagrams/lucid/lucid-real-export.csv');

function extract(csv: string) {
  return new LucidCsvExtractor().extract({
    buffer: Buffer.from(csv, 'utf8'),
    text: csv,
  } as never);
}

describe('Lucid CSV extraction from a real export', () => {
  const csv = readFileSync(FIXTURE, 'utf8');

  it('reads node labels from Text Area 1, not from the shape type in Name', () => {
    const { nodes } = extract(csv);

    expect(nodes.map((node) => node.rawLabel)).toEqual([
      'EC2 Web Server',
      'RDS PostgreSQL database 200GB',
      'S3 Bucket 500GB',
      'Application Load Balancer',
    ]);
  });

  it('does not label any node with the shape type', () => {
    // The specific regression: with `name` read first every node was "Process",
    // which matches no stencil and no service, so the whole diagram resolved to
    // an empty draft.
    const { nodes } = extract(csv);

    expect(nodes.filter((node) => node.rawLabel === 'Process')).toEqual([]);
  });

  it('reads the stencil hint from Shape Library', () => {
    const { nodes } = extract(csv);

    expect(new Set(nodes.map((node) => node.stencilId))).toEqual(new Set(['AWS 2017']));
  });

  it('still reads a hand-written CSV whose Name is the label', () => {
    /*
      The fallback has to survive. draw.io-style and hand-built CSVs put the
      label in `Name` and have no Text Area column at all, and the older fixture
      in this repo is one of them.
    */
    const { nodes } = extract('Id,Name,Shape\n1,EC2 Web Server,EC2\n2,S3 Bucket,S3\n');

    expect(nodes.map((node) => node.rawLabel)).toEqual(['EC2 Web Server', 'S3 Bucket']);
  });

  it('reads the connection between two shapes', () => {
    // Row 5 is a Line with Line Source/Line Destination, which must become an
    // edge rather than a fifth node.
    const { edges, nodes } = extract(csv);

    expect(nodes).toHaveLength(4);
    expect(edges).toEqual([{ id: '5', sourceId: '1', targetId: '2' }]);
  });
});
