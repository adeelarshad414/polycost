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
      expect(constructorTypes(target).at(index)).toBe(Function);
      expect(optionalDependencyIndexes(target)).toContain(index);
      expect(selfDeclaredDependencyToken(target, index)).toBe(token);
    },
  );
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
