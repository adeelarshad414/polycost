#!/usr/bin/env node
// Generates docs/api/openapi.json from the controllers.
//
// Extracted from source with the TypeScript compiler API rather than
// hand-written, because a hand-written spec for 100+ routes is stale the day
// after it is written. scripts/openapi-check.mjs regenerates and diffs, so
// drift fails the build instead of being discovered by a client.
//
// Scope, stated plainly: this documents the API *surface* - paths, methods,
// path parameters, and the error envelope. It does NOT invent request and
// response body schemas. Request validation in this codebase is hand-rolled
// per controller rather than declared (no zod DTOs, no class-validator), so
// there is no machine-readable body shape to derive from. Guessing would
// produce a spec that is confidently wrong, which is worse for a client than
// one that is honestly incomplete. Bodies are marked as unspecified.
import { readFileSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const SRC = path.join(root, 'apps/api/src');
const OUT = path.join(root, 'docs/api/openapi.json');

const HTTP_DECORATORS = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete']);

// Endpoints that exist for infrastructure, not API consumers.
const OPERATIONAL_PATHS = new Set(['/metrics']);

function controllerFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...controllerFiles(full));
    } else if (entry.endsWith('.controller.ts') && !entry.endsWith('.spec.ts')) {
      found.push(full);
    }
  }
  return found;
}

/** The string literal argument of a decorator, or '' when it has none. */
function decoratorArgument(decorator) {
  const call = decorator.expression;
  if (!ts.isCallExpression(call) || call.arguments.length === 0) {
    return '';
  }
  const [first] = call.arguments;
  return ts.isStringLiteral(first) ? first.text : '';
}

function decoratorName(decorator) {
  const call = decorator.expression;
  const target = ts.isCallExpression(call) ? call.expression : call;
  return ts.isIdentifier(target) ? target.text : '';
}

/** getDataHealth -> "Get data health"; create -> "Create". */
function humanize(methodName) {
  const words = methodName
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .trim();

  return words.charAt(0).toUpperCase() + words.slice(1);
}

function joinPath(prefix, suffix) {
  const segments = [...prefix.split('/'), ...suffix.split('/')].filter((s) => s.length > 0);
  return `/${segments.join('/')}`;
}

/** Nest ':id' style becomes OpenAPI '{id}', and the names become parameters. */
function toOpenApiPath(routePath) {
  const parameters = [];
  const converted = routePath
    .split('/')
    .map((segment) => {
      if (!segment.startsWith(':')) {
        return segment;
      }
      const name = segment.slice(1);
      parameters.push(name);
      return `{${name}}`;
    })
    .join('/');

  return { path: converted, parameters };
}

const routes = [];

for (const file of controllerFiles(SRC)) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );

  source.forEachChild((node) => {
    if (!ts.isClassDeclaration(node)) {
      return;
    }

    const classDecorators = ts.getDecorators(node) ?? [];
    const controller = classDecorators.find((d) => decoratorName(d) === 'Controller');
    if (!controller) {
      return;
    }

    const prefix = decoratorArgument(controller);
    const tag = node.name?.text.replace(/Controller$/, '') ?? 'Api';

    for (const member of node.members) {
      if (!ts.isMethodDeclaration(member)) {
        continue;
      }

      for (const decorator of ts.getDecorators(member) ?? []) {
        const name = decoratorName(decorator);
        if (!HTTP_DECORATORS.has(name)) {
          continue;
        }

        const full = joinPath(prefix, decoratorArgument(decorator));
        const { path: openApiPath, parameters } = toOpenApiPath(full);

        routes.push({
          summary: humanize(member.name?.getText() ?? 'handler'),
          method: name.toLowerCase(),
          path: openApiPath,
          parameters,
          tag,
          operationId: `${tag}_${member.name?.getText() ?? 'handler'}`,
          operational: OPERATIONAL_PATHS.has(openApiPath),
        });
      }
    }
  });
}

routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

// The error envelope is uniform because every failure goes through
// ApiExceptionFilter, so unlike request bodies this can be documented exactly.
const ERROR_SCHEMA = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: {
          type: 'string',
          enum: [
            'VALIDATION_ERROR',
            'NWS_MIGRATION_REQUIRED',
            'WORKLOAD_PARSE_ERROR',
            'UNAUTHORIZED',
            'FORBIDDEN',
            'NOT_FOUND',
            'CONFLICT',
            'RATE_LIMIT_EXCEEDED',
            'PRICING_UNAVAILABLE',
            'LIVE_REFRESH_UNAVAILABLE',
            'HTTP_ERROR',
            'INTERNAL_ERROR',
          ],
        },
        message: { type: 'string' },
        details: {
          type: 'array',
          items: {
            type: 'object',
            required: ['issue'],
            properties: { field: { type: 'string' }, issue: { type: 'string' } },
          },
        },
      },
    },
  },
};

const errorResponse = (description) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
});

const paths = {};

for (const route of routes) {
  paths[route.path] ??= {};

  paths[route.path][route.method] = {
    // Derived from the handler name rather than hand-written, so it cannot
    // drift from the code the way a maintained description would.
    summary: route.summary,
    operationId: route.operationId,
    tags: [route.tag],
    ...(route.operational
      ? { description: 'Operational endpoint. Not part of the public API contract.' }
      : {}),
    ...(route.parameters.length > 0
      ? {
          parameters: route.parameters.map((name) => ({
            name,
            in: 'path',
            required: true,
            schema: { type: 'string' },
          })),
        }
      : {}),
    ...(route.method === 'post' || route.method === 'put' || route.method === 'patch'
      ? {
          requestBody: {
            required: true,
            content: {
              'application/json': {
                // Deliberately unconstrained - see the note at the top of this
                // file and in the spec description.
                schema: { type: 'object', additionalProperties: true },
              },
            },
          },
        }
      : {}),
    responses: {
      200: { description: 'Success' },
      400: errorResponse('Validation failed'),
      401: errorResponse('Authentication required or session invalid'),
      429: errorResponse('Rate limit exceeded; see the Retry-After header'),
      500: errorResponse('Unexpected server error'),
    },
  };
}

const document = {
  openapi: '3.1.0',
  info: {
    title: 'PolyCost API',
    version: '0.1.0',
    description: [
      'Multi-cloud cost comparison API.',
      '',
      'Generated from the controllers by scripts/openapi-generate.mjs and kept',
      'honest by scripts/openapi-check.mjs, which fails the build on drift.',
      '',
      'Request and response bodies are intentionally unconstrained. Validation',
      'in this service is hand-rolled per controller rather than declared, so',
      'there is no machine-readable body shape to generate from; publishing a',
      'guessed schema would mislead clients. The error envelope below is exact,',
      'because every failure passes through a single exception filter.',
    ].join('\n'),
  },
  servers: [{ url: '/', description: 'The API is served from the application root' }],
  components: { schemas: { ErrorResponse: ERROR_SCHEMA } },
  paths,
};

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(document, null, 2)}\n`);

const operationCount = routes.length;
const pathCount = Object.keys(paths).length;
console.log(
  `Wrote ${path.relative(root, OUT)}: ${operationCount} operations across ${pathCount} paths.`,
);
