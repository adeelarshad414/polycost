import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { RequestWithAuth } from './auth.types';
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

  @Post('reconciliations/:id/artifacts')
  registerInvoiceGradeArtifact(
    @Param('id') reconciliationId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth,
  ) {
    return this.billingService.registerInvoiceGradeArtifact(reconciliationId, body, request.auth!);
  }
}
