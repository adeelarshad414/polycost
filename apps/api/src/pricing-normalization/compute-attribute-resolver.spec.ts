import { describe, it, expect } from '@jest/globals';
import { createRequire } from 'node:module';
import {
  resolveComputeTenancy,
  resolveInstanceFamily,
  resolveProcessorArchitecture,
  type ComputeAttributeSource,
  type ProviderId,
} from './compute-attribute-resolver.js';

/*
  The resolvers, run over attribute shapes captured from a live catalog.

  Four consecutive resolver defects shipped against a green suite - #224 (family
  read out of an opaque SKU id), #225 (multi-letter family prefixes), #226 (rate
  superseding) and #227 (Graviton, Azure Ampere, capitalised tenancy). Every one
  was a resolver returning the wrong value on an attribute shape the mock
  catalog does not produce, and every one was found by hand-querying Postgres
  rather than by a test.

  This closes that gap. The fixture is 951 distinct compute shapes taken from a
  real catalog - one representative per distinct combination of family label,
  processor string, architecture attribute, size-name shape and tenancy label,
  with prices and lineage stripped. Rebuild it with:

    node scripts/pricing-catalog-shape-fixture-build.mjs

  Two layers of assertion, because they fail differently:

  - the DISTRIBUTION test pins how many shapes resolve to each value. It has no
    opinion about any single row, but nothing can change resolution behaviour
    across the corpus without moving a number. That is the regression net.
  - the LANDMARK tests pin named shapes whose correct answer is the whole point
    of a past fix. They say *why* the numbers are what they are, and they fail
    with a readable message instead of an arithmetic diff.

  When a number here changes, it is one of two things and they look identical:
  a provider changed what it publishes, or a resolver regressed. Rebuild the
  fixture and read that diff before touching the expectations.
*/

interface CapturedShape extends ComputeAttributeSource {
  provider: ProviderId;
}

// JSON import assertions are still unstable across the TS/Node/Jest ESM
// combination this repo pins, so the fixture is loaded through require.
const shapes = createRequire(import.meta.url)(
  './__fixtures__/live-catalog-shapes.json',
) as CapturedShape[];

function tally(resolve: (shape: CapturedShape) => string | undefined): Record<string, number> {
  // Counted in a Map rather than a plain object: a computed index on a
  // Record<string, number> is an object-injection sink as far as the lint rule
  // is concerned, and this needs no suppression to avoid it.
  const counts = new Map<string, number>();

  for (const shape of shapes) {
    const key = `${shape.provider}/${resolve(shape) ?? 'unresolved'}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}

/**
 * Every captured shape containing `needle`. Landmark tests assert over all of
 * them, not the first: an earlier draft took `shapes.find(...)` for the
 * promotional-suffix case and got Standard_D14_v2_Promo, whose `v2` makes it
 * fail to parse for an unrelated reason - so the test passed with the fix
 * reverted while Standard_H16_Promo, the actual trap, went unchecked.
 */
function shapesWith(provider: ProviderId, needle: string): CapturedShape[] {
  const matches = shapes.filter(
    (shape) => shape.provider === provider && JSON.stringify(shape).includes(needle),
  );

  if (matches.length === 0) {
    throw new Error(
      `no captured ${provider} shape contains ${needle}; the fixture no longer covers this case`,
    );
  }

  return matches;
}

function shapeWith(provider: ProviderId, needle: string): CapturedShape {
  return shapesWith(provider, needle)[0];
}

function sizeNameOf(shape: CapturedShape): string {
  return String(shape.attributes?.armSkuName ?? shape.attributes?.skuName ?? shape.skuId);
}

describe('resolvers against captured live catalog shapes', () => {
  it('captures a corpus big enough to be worth asserting against', () => {
    // Guards the fixture itself: an empty or truncated file would make every
    // distribution assertion below trivially pass.
    expect(shapes.length).toBeGreaterThan(900);
    expect(new Set(shapes.map((shape) => shape.provider))).toEqual(
      new Set(['aws', 'azure', 'gcp']),
    );
  });

  it('resolves processor architecture with a stable distribution', () => {
    expect(tally((shape) => resolveProcessorArchitecture(shape.provider, shape))).toEqual({
      'aws/arm64': 204,
      'aws/gpu': 6,
      'aws/unresolved': 2,
      'aws/x86_64': 406,
      'azure/arm64': 10,
      'azure/gpu': 17,
      'azure/unresolved': 286,
      'azure/x86_64': 10,
      'gcp/arm64': 1,
      'gcp/gpu': 2,
      'gcp/unresolved': 1,
      'gcp/x86_64': 6,
    });
  });

  it('resolves compute tenancy with a stable distribution', () => {
    expect(tally((shape) => resolveComputeTenancy(shape))).toEqual({
      'aws/shared': 609,
      'aws/unresolved': 9,
      'azure/dedicated-host': 27,
      'azure/unresolved': 296,
      'gcp/unresolved': 10,
    });
  });

  it('resolves instance family with a stable distribution', () => {
    expect(tally((shape) => resolveInstanceFamily(shape.provider, shape))).toEqual({
      'aws/accelerated-computing': 44,
      'aws/burstable': 31,
      'aws/compute-optimized': 144,
      'aws/general-purpose': 168,
      'aws/memory-optimized': 182,
      'aws/storage-optimized': 48,
      'aws/unresolved': 1,
      'azure/accelerated-computing': 10,
      'azure/burstable': 14,
      'azure/compute-optimized': 8,
      'azure/general-purpose': 20,
      'azure/memory-optimized': 41,
      'azure/storage-optimized': 5,
      'azure/unresolved': 225,
      'gcp/accelerated-computing': 2,
      'gcp/burstable': 2,
      'gcp/compute-optimized': 1,
      'gcp/general-purpose': 2,
      'gcp/memory-optimized': 1,
      'gcp/storage-optimized': 1,
      'gcp/unresolved': 1,
    });
  });
});

describe('landmark shapes from past defects', () => {
  it('reads every Graviton generation as arm64 (#227)', () => {
    /*
      The pattern required a word boundary straight after `graviton`, and every
      generation after the first carries a digit there. Asserted per generation
      because only the numbered ones were broken - a fix that handled
      "Graviton" alone would have looked correct.
    */
    for (const processor of ['Graviton', 'Graviton2', 'Graviton3', 'Graviton4']) {
      const shape = shapeWith('aws', `AWS ${processor} Processor`);

      expect({ processor, architecture: resolveProcessorArchitecture('aws', shape) }).toEqual({
        processor,
        architecture: 'arm64',
      });
    }
  });

  it('reads every Azure Ampere size name as arm64 with no processor attribute (#227)', () => {
    const ampere = shapesWith('azure', 'ps_v');

    expect(ampere.length).toBeGreaterThan(0);
    for (const shape of ampere) {
      expect({
        size: sizeNameOf(shape),
        processor: shape.attributes?.physicalProcessor,
        architecture: resolveProcessorArchitecture('azure', shape),
      }).toEqual({
        size: sizeNameOf(shape),
        processor: undefined,
        architecture: 'arm64',
      });
    }
  });

  it('does not read the p of a promotional suffix as Ampere (#227)', () => {
    /*
      Standard_H16_Promo collapses to `...16promo`, and a variant charclass open
      to [a-z] takes that `p` for Ampere - flipping an x86 HPC part to arm64.
      Every promotional shape is checked, and H16 specifically is required to be
      among them, because the other promo names fail to parse for unrelated
      reasons and would carry the test on their own.
    */
    const promotional = shapesWith('azure', '_Promo');

    expect(promotional.map(sizeNameOf)).toContain('Standard_H16_Promo');
    for (const shape of promotional) {
      expect({
        size: sizeNameOf(shape),
        isAmpere: resolveProcessorArchitecture('azure', shape) === 'arm64',
      }).toEqual({ size: sizeNameOf(shape), isAmpere: false });
    }
  });

  it('reads AWS capitalised tenancy (#227)', () => {
    const shape = shapeWith('aws', '"tenancy":"Shared"');

    expect(resolveComputeTenancy(shape)).toBe('shared');
  });

  it('reads an Azure Dedicated Host SKU from its description (#227)', () => {
    // Azure publishes no tenancy attribute at all; the descriptor fallback is
    // the only thing that resolves these.
    const shape = shapeWith('azure', 'Dedicated Host');

    expect(shape.attributes?.tenancy).toBeUndefined();
    expect(resolveComputeTenancy(shape)).toBe('dedicated-host');
  });

  it('does not read a family out of an opaque AWS sku id (#224)', () => {
    /*
      Live AWS sku ids are opaque 16-character strings, and a single-letter
      family prefix matches one at random. This asserts the resolved family
      agrees with the instance type rather than the id.
    */
    const burstable = shapes.filter(
      (shape) =>
        shape.provider === 'aws' &&
        typeof shape.attributes?.instanceType === 'string' &&
        /^t\d/.test(shape.attributes.instanceType),
    );

    expect(burstable.length).toBeGreaterThan(0);
    for (const shape of burstable) {
      expect({
        instanceType: shape.attributes?.instanceType,
        family: resolveInstanceFamily('aws', shape),
      }).toEqual({ instanceType: shape.attributes?.instanceType, family: 'burstable' });
    }
  });

  it('reads multi-letter AWS families from the whole prefix (#225)', () => {
    // trn1, dl1 and hpc7a read as t, d and h from their first character, which
    // made a Trainium accelerator an exact match for a burstable request.
    for (const [prefix, expected] of [
      ['trn', 'accelerated-computing'],
      ['dl', 'accelerated-computing'],
      ['hpc', 'compute-optimized'],
    ] as const) {
      const matches = shapes.filter(
        (shape) =>
          shape.provider === 'aws' &&
          typeof shape.attributes?.instanceType === 'string' &&
          shape.attributes.instanceType.startsWith(prefix),
      );

      for (const shape of matches) {
        expect({
          instanceType: shape.attributes?.instanceType,
          family: resolveInstanceFamily('aws', shape),
        }).toEqual({ instanceType: shape.attributes?.instanceType, family: expected });
      }
    }
  });
});
