import {
  OPTIONAL_DEPS_METADATA,
  PARAMTYPES_METADATA,
  SELF_DECLARED_DEPS_METADATA,
} from '@nestjs/common/constants';
import {
  INVITATION_DELIVERY_FETCH,
  InvitationDeliveryService,
} from './invitation-delivery.service';
import { AuthService } from './auth.service';
import {
  INVOICE_ARTIFACT_GOVERNANCE_FETCH,
  InvoiceArtifactGovernanceService,
} from './invoice-artifact-governance.service';
import {
  INVOICE_EVIDENCE_NOTARY_FETCH,
  INVOICE_EVIDENCE_NOTARY_NOW,
  InvoiceEvidenceNotaryService,
} from './invoice-evidence-notary.service';
import {
  TEAM_AUDIT_EXPORT_FETCH,
  TEAM_AUDIT_EXPORT_NOW,
  TeamAuditExportService,
} from './team-audit-export.service';

interface SelfDeclaredDependency {
  index: number;
  param: unknown;
}

describe('runtime dependency injection metadata', () => {
  it('keeps AuthService invitation delivery injectable in production', () => {
    expect(constructorTypes(AuthService).at(2)).toBe(InvitationDeliveryService);
    expect(optionalDependencyIndexes(AuthService)).toContain(2);
    expect(selfDeclaredDependencyToken(AuthService, 2)).toBe(InvitationDeliveryService);
  });

  /*
    What Nest actually resolves these by is the explicit token, so the token and
    the @Optional marking are the assertions that guard behaviour. The emitted
    design:paramtypes entry is an artefact of how the parameter's type was
    written, and it is split out below because it is not uniform.

    Five of these declare their FetchLike/NowLike alias locally, so the
    transpiler can see it is a function type and emits Function.
    InvoiceArtifactGovernanceService imports the richer shared FetchLike from
    http-client, which isolatedModules requires be an `import type` - and a
    per-file transpiler cannot then see what it aliases, so it emits Object.
    (`tsc`, which has the whole program, still emits Function; the difference is
    only visible under ts-jest.) Object is correct and harmless here precisely
    because a type that must be imported as a type has no runtime value, and so
    could never have served as a DI token in the first place.
  */
  it.each([
    [InvitationDeliveryService, 1, INVITATION_DELIVERY_FETCH],
    [TeamAuditExportService, 2, TEAM_AUDIT_EXPORT_FETCH],
    [TeamAuditExportService, 3, TEAM_AUDIT_EXPORT_NOW],
    [InvoiceArtifactGovernanceService, 1, INVOICE_ARTIFACT_GOVERNANCE_FETCH],
    [InvoiceEvidenceNotaryService, 1, INVOICE_EVIDENCE_NOTARY_FETCH],
    [InvoiceEvidenceNotaryService, 2, INVOICE_EVIDENCE_NOTARY_NOW],
  ] as const)(
    'marks %p constructor argument %i as an optional custom-token dependency',
    (target, index, token) => {
      expect(optionalDependencyIndexes(target)).toContain(index);
      expect(selfDeclaredDependencyToken(target, index)).toBe(token);
    },
  );

  it.each([
    [InvitationDeliveryService, 1],
    [TeamAuditExportService, 2],
    [TeamAuditExportService, 3],
    [InvoiceEvidenceNotaryService, 1],
    [InvoiceEvidenceNotaryService, 2],
  ] as const)(
    'emits a function design type for %p constructor argument %i, whose alias is declared locally',
    (target, index) => {
      expect(constructorTypes(target).at(index)).toBe(Function);
    },
  );

  it('emits Object for a parameter typed by an imported type alias', () => {
    // Not a regression - the contrast with the locally-declared cases above is
    // the point, and it is why the token assertions are what guard DI.
    expect(constructorTypes(InvoiceArtifactGovernanceService).at(1)).toBe(Object);
    expect(selfDeclaredDependencyToken(InvoiceArtifactGovernanceService, 1)).toBe(
      INVOICE_ARTIFACT_GOVERNANCE_FETCH,
    );
  });
});

function constructorTypes(target: object): unknown[] {
  return Reflect.getMetadata(PARAMTYPES_METADATA, target) ?? [];
}

function optionalDependencyIndexes(target: object): number[] {
  return Reflect.getMetadata(OPTIONAL_DEPS_METADATA, target) ?? [];
}

function selfDeclaredDependencyToken(target: object, index: number): unknown {
  const dependencies: SelfDeclaredDependency[] =
    Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, target) ?? [];

  return dependencies.find((dependency) => dependency.index === index)?.param;
}
