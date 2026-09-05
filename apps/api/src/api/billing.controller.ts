import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { RequestWithAuth } from './auth.types';
import { BillingService } from './billing.service';
import { SessionAuthGuard } from './session-auth.guard';

@Controller('api/v1/billing')
@UseGuards(SessionAuthGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('imports')
  importActuals(@Body() body: unknown, @Req() request: RequestWithAuth) {
    return this.billingService.importActuals(body, request.auth!);
  }

  @Post('imports/provider-export')
  importProviderExport(@Body() body: unknown, @Req() request: RequestWithAuth) {
    return this.billingService.importProviderExport(body, request.auth!);
  }

  @Post('imports/:id/reconcile')
  reconcile(
    @Param('id') importRunId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth,
  ) {
    return this.billingService.reconcile(importRunId, body, request.auth!);
  }

  @Get('imports/:id/reconciliation')
  listReconciliations(@Param('id') importRunId: string, @Req() request: RequestWithAuth) {
    return this.billingService.listReconciliations(importRunId, request.auth!);
  }

  @Get('imports/:id/artifact-reviews')
  listInvoiceArtifactReviews(@Param('id') importRunId: string, @Req() request: RequestWithAuth) {
    return this.billingService.listInvoiceArtifactReviews(importRunId, request.auth!);
  }

  @Get('imports/:id/artifact-policy-exceptions')
  listInvoiceArtifactPolicyExceptions(
    @Param('id') importRunId: string,
    @Req() request: RequestWithAuth,
  ) {
    return this.billingService.listInvoiceArtifactPolicyExceptions(importRunId, request.auth!);
  }

  // Exporting an evidence packet notarizes it (an outbound webhook delivery when
  // configured) and writes a team audit event, so it is a POST action, not a
  // safe/idempotent GET — a GET here would fire those side effects on every
  // prefetch, cache revalidation, or retry.
  @Post('reconciliations/:id/evidence-packet/export')
  exportInvoiceEvidencePacket(
    @Param('id') reconciliationId: string,
    @Req() request: RequestWithAuth,
  ) {
    return this.billingService.exportInvoiceEvidencePacket(reconciliationId, request.auth!);
  }

  @Post('reconciliations/:id/artifacts')
  registerInvoiceGradeArtifact(
    @Param('id') reconciliationId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth,
  ) {
    return this.billingService.registerInvoiceGradeArtifact(reconciliationId, body, request.auth!);
  }

  @Post('reconciliations/:id/artifacts/:artifactId/verification')
  verifyInvoiceGradeArtifact(
    @Param('id') reconciliationId: string,
    @Param('artifactId') artifactId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth,
  ) {
    return this.billingService.verifyInvoiceGradeArtifact(
      reconciliationId,
      artifactId,
      body,
      request.auth!,
    );
  }

  @Post('reconciliations/:id/artifacts/:artifactId/invoice-control-validation')
  validateInvoiceControlPacket(
    @Param('id') reconciliationId: string,
    @Param('artifactId') artifactId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth,
  ) {
    return this.billingService.validateInvoiceControlPacket(
      reconciliationId,
      artifactId,
      body,
      request.auth!,
    );
  }

  @Post('reconciliations/:id/artifacts/:artifactId/blob')
  uploadInvoiceArtifactBlob(
    @Param('id') reconciliationId: string,
    @Param('artifactId') artifactId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth,
  ) {
    return this.billingService.uploadInvoiceArtifactBlob(
      reconciliationId,
      artifactId,
      body,
      request.auth!,
    );
  }

  @Get('artifact-storage/readiness')
  getInvoiceArtifactStorageReadiness(@Req() request: RequestWithAuth) {
    return this.billingService.getInvoiceArtifactStorageReadiness(request.auth!);
  }

  @Patch('reconciliations/:id/artifacts/:artifactId/blob/legal-hold')
  setInvoiceArtifactLegalHold(
    @Param('id') reconciliationId: string,
    @Param('artifactId') artifactId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth,
  ) {
    return this.billingService.setInvoiceArtifactLegalHold(
      reconciliationId,
      artifactId,
      body,
      request.auth!,
    );
  }

  @Patch('reconciliations/:id/artifacts/:artifactId/blob/provider-retention-proof')
  attachInvoiceArtifactProviderRetentionProof(
    @Param('id') reconciliationId: string,
    @Param('artifactId') artifactId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth,
  ) {
    return this.billingService.attachInvoiceArtifactProviderRetentionProof(
      reconciliationId,
      artifactId,
      body,
      request.auth!,
    );
  }

  @Patch('reconciliations/:id/artifacts/:artifactId/review')
  updateInvoiceArtifactReview(
    @Param('id') reconciliationId: string,
    @Param('artifactId') artifactId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth,
  ) {
    return this.billingService.updateInvoiceArtifactReview(
      reconciliationId,
      artifactId,
      body,
      request.auth!,
    );
  }

  @Patch('reconciliations/:id/artifacts/:artifactId/policy-exception')
  updateInvoiceArtifactPolicyException(
    @Param('id') reconciliationId: string,
    @Param('artifactId') artifactId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth,
  ) {
    return this.billingService.updateInvoiceArtifactPolicyException(
      reconciliationId,
      artifactId,
      body,
      request.auth!,
    );
  }

  @Post('artifact-storage/retention/enforce')
  enforceInvoiceArtifactRetention(@Body() body: unknown, @Req() request: RequestWithAuth) {
    return this.billingService.enforceInvoiceArtifactRetention(body, request.auth!);
  }

  @Get('reconciliations/:id/artifacts/:artifactId/blob')
  downloadInvoiceArtifactBlob(
    @Param('id') reconciliationId: string,
    @Param('artifactId') artifactId: string,
    @Req() request: RequestWithAuth,
  ) {
    return this.billingService.downloadInvoiceArtifactBlob(
      reconciliationId,
      artifactId,
      request.auth!,
    );
  }
}
