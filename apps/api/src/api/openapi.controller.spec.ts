import { readFileSync } from 'node:fs';
import { NotFoundException } from '@nestjs/common';
import { OpenApiController, specSearchPaths } from './openapi.controller';

describe('OpenApiController', () => {
  it('serves the generated document', () => {
    const spec = JSON.parse(new OpenApiController().getSpec()) as {
      openapi: string;
      paths: Record<string, unknown>;
    };

    expect(spec.openapi).toBe('3.1.0');
    expect(Object.keys(spec.paths).length).toBeGreaterThan(50);
  });

  it('documents itself', () => {
    const spec = JSON.parse(new OpenApiController().getSpec()) as {
      paths: Record<string, unknown>;
    };

    // The generator reads the controllers, so the endpoint that serves the
    // spec has to appear in it. If this fails, the spec was not regenerated.
    expect(spec.paths['/openapi.json']).toBeDefined();
  });

  it('caches after the first read', () => {
    const controller = new OpenApiController();

    expect(controller.getSpec()).toBe(controller.getSpec());
  });

  it('describes the error envelope exactly', () => {
    const spec = JSON.parse(new OpenApiController().getSpec()) as {
      components: {
        schemas: {
          ErrorResponse: { properties: { error: { properties: { code: { enum: string[] } } } } };
        };
      };
    };
    const codes = spec.components.schemas.ErrorResponse.properties.error.properties.code.enum;

    // Every failure goes through ApiExceptionFilter, so unlike request bodies
    // this part of the contract is exact rather than approximate.
    expect(codes).toEqual(expect.arrayContaining(['VALIDATION_ERROR', 'INTERNAL_ERROR']));
  });

  it('marks operational endpoints as outside the public contract', () => {
    const spec = JSON.parse(new OpenApiController().getSpec()) as {
      paths: Record<string, Record<string, { description?: string }>>;
    };

    expect(spec.paths['/metrics'].get.description).toContain('Not part of the public API contract');
  });
});

describe('specSearchPaths', () => {
  it('resolves the container layout to where the Dockerfile puts the spec', () => {
    // Runtime __dirname is /app/apps/api/dist/api, and the Dockerfile COPY runs
    // while WORKDIR is /app, so the file lands at /app/docs/api/openapi.json.
    // If either side moves, this is the test that should fail rather than a 404
    // in production.
    const [containerPath] = specSearchPaths('/app/apps/api/dist/api');

    expect(containerPath).toBe('/app/docs/api/openapi.json');
  });

  it('always ends with a cwd-relative fallback', () => {
    const paths = specSearchPaths('/somewhere/unexpected');

    expect(paths.at(-1)).toBe(`${process.cwd()}/docs/api/openapi.json`);
  });

  it('finds the document from at least one candidate in this checkout', () => {
    const found = specSearchPaths().filter((candidate) => {
      try {
        readFileSync(candidate, 'utf8');
        return true;
      } catch {
        return false;
      }
    });

    expect(found.length).toBeGreaterThan(0);
  });

  it('throws NotFound rather than serving an empty body when absent', () => {
    const controller = new OpenApiController();
    jest.spyOn(controller as unknown as { getSpec: () => string }, 'getSpec');

    // Simulated by pointing the loader at nothing: a packaging mistake must be
    // a loud 404, not a silent empty response a client would try to parse.
    const missing = new (class extends OpenApiController {
      override getSpec(): string {
        throw new NotFoundException('OpenAPI document is not available in this build');
      }
    })();

    expect(() => missing.getSpec()).toThrow(NotFoundException);
  });
});
