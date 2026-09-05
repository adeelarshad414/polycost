import { NormalizedWorkloadSpec, normalizedWorkloadSpecSchema } from './nws.types.js';

export interface NWSValidationIssue {
  path: string;
  message: string;
}

export class NWSValidationError extends Error {
  constructor(
    message: string,
    readonly issues: NWSValidationIssue[],
  ) {
    super(message);
    this.name = 'NWSValidationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NWSMigrationError extends NWSValidationError {
  constructor(issues: NWSValidationIssue[]) {
    super('NWS schema migration required', issues);
    this.name = 'NWSMigrationError';
  }
}

export class NWSValidator {
  static validate(input: unknown): NormalizedWorkloadSpec {
    const parsed = normalizedWorkloadSpecSchema.safeParse(input);

    if (parsed.success) {
      return parsed.data;
    }

    const issues = parsed.error.issues.map((issue) => ({
      path: issue.path.length > 0 ? issue.path.join('.') : '<root>',
      message: issue.message,
    }));

    if (
      issues.some(
        (issue) =>
          issue.path === 'schemaVersion' && issue.message.includes('Unsupported NWS schemaVersion'),
      )
    ) {
      throw new NWSMigrationError(issues);
    }

    throw new NWSValidationError('Invalid Normalized Workload Specification', issues);
  }
}
