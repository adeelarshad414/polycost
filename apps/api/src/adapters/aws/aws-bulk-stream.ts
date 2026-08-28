import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/Pick';
import { streamObject } from 'stream-json/streamers/StreamObject';

/**
 * Streams the AWS bulk Price List index without buffering the whole (~480 MB)
 * document into memory. The body is spooled to a temp file once, then walked in
 * memory-bounded passes: `products` (filtered to the caller's category), then
 * `terms.OnDemand` / `terms.Reserved` (kept only for the retained SKUs). The
 * assembled, filtered structure is small and safe to normalize as before.
 */
export async function streamAwsBulkPriceList<Product extends { sku: string }, Term>(
  body: Readable,
  productMatches: (product: Product) => boolean,
): Promise<{
  products: Record<string, Product>;
  terms: {
    OnDemand: Record<string, Record<string, Term>>;
    Reserved: Record<string, Record<string, Term>>;
  };
}> {
  const dir = await mkdtemp(join(tmpdir(), 'polycost-aws-bulk-'));
  const file = join(dir, 'index.json');

  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Reviewed 2026-08-20: path is a process-owned mkdtemp temp file, never user input; see docs/SECURITY-SUPPRESSIONS.md.
    await pipeline(body, createWriteStream(file));

    // Maps avoid dynamic string-keyed object writes (object-injection sinks)
    // while assembling from streamed SKUs; converted to plain records at the end.
    const products = new Map<string, Product>();
    await streamObjectEntries<Product>(file, 'products', (_sku, product) => {
      if (product && typeof product.sku === 'string' && productMatches(product)) {
        products.set(product.sku, product);
      }
    });

    const onDemand = new Map<string, Record<string, Term>>();
    await streamObjectEntries<Record<string, Term>>(file, 'terms.OnDemand', (sku, value) => {
      if (products.has(sku)) {
        onDemand.set(sku, value);
      }
    });

    const reserved = new Map<string, Record<string, Term>>();
    await streamObjectEntries<Record<string, Term>>(file, 'terms.Reserved', (sku, value) => {
      if (products.has(sku)) {
        reserved.set(sku, value);
      }
    });

    return {
      products: Object.fromEntries(products),
      terms: {
        OnDemand: Object.fromEntries(onDemand),
        Reserved: Object.fromEntries(reserved),
      },
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function streamObjectEntries<T>(
  file: string,
  path: string,
  onEntry: (key: string, value: T) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const pipe = chain([
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Reviewed 2026-08-20: path is a process-owned mkdtemp temp file, never user input; see docs/SECURITY-SUPPRESSIONS.md.
      createReadStream(file),
      parser(),
      pick({ filter: path }),
      streamObject(),
    ]);
    pipe.on('data', (entry: { key: string; value: T }) => onEntry(entry.key, entry.value));
    pipe.on('end', () => resolve());
    pipe.on('error', reject);
  });
}
