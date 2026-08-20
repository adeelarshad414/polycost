// Minimal ambient declarations for the subset of stream-json / stream-chain the
// AWS bulk streaming parser uses. stream-json v1 ships no type definitions.
declare module 'stream-chain' {
  import { Duplex } from 'node:stream';
  export function chain(fns: unknown[]): Duplex;
}

declare module 'stream-json' {
  import { Duplex } from 'node:stream';
  export function parser(options?: unknown): Duplex;
}

declare module 'stream-json/filters/Pick' {
  import { Duplex } from 'node:stream';
  export function pick(options: {
    filter: string | RegExp | ((stack: unknown[]) => boolean);
  }): Duplex;
}

declare module 'stream-json/streamers/StreamObject' {
  import { Duplex } from 'node:stream';
  export function streamObject(options?: unknown): Duplex;
}
