// Minimal ambient declarations for the subset of stream-json / stream-chain the
// AWS bulk streaming parser uses. stream-json v1 ships no type definitions.
//
// Two things here are dictated by these being CommonJS packages consumed from
// an ESM module, and both were found by running the container rather than by
// type-checking:
//
//  1. The deep specifiers carry `.js`. stream-json has no `exports` map, so
//     Node ESM resolves them as literal file paths. When the declarations
//     omitted the extension, tsc was satisfied and Node could not resolve the
//     import at all.
//
//  2. Each module is declared with a default export rather than named ones.
//     Node's ESM/CJS interop detects named exports with a static lexer, and it
//     cannot see through how these packages assign their exports - so
//     `import { chain } from 'stream-chain'` throws at runtime while
//     type-checking cleanly. The default import always works, and destructuring
//     from it is the documented workaround.
declare module 'stream-chain' {
  import { Duplex } from 'node:stream';
  const streamChain: { chain(fns: unknown[]): Duplex };
  export default streamChain;
}

declare module 'stream-json' {
  import { Duplex } from 'node:stream';
  const streamJson: { parser(options?: unknown): Duplex };
  export default streamJson;
}

declare module 'stream-json/filters/Pick.js' {
  import { Duplex } from 'node:stream';
  const pickModule: {
    pick(options: { filter: string | RegExp | ((stack: unknown[]) => boolean) }): Duplex;
  };
  export default pickModule;
}

declare module 'stream-json/streamers/StreamObject.js' {
  import { Duplex } from 'node:stream';
  const streamObjectModule: { streamObject(options?: unknown): Duplex };
  export default streamObjectModule;
}
