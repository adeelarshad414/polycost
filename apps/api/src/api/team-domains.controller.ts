import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { RequestWithAuth } from './auth.types.js';
import { RouteAccess } from './route-access.js';
import { SessionAuthGuard } from './session-auth.guard.js';
import { TeamDomainsService } from './team-domains.service.js';

/** Audit H-01: email domains a team owns, which SCIM may provision. Owners and admins only. */
@RouteAccess('session')
@UseGuards(SessionAuthGuard)
@Controller('api/v1/auth/teams/:teamId/domains')
export class TeamDomainsController {
  constructor(private readonly teamDomains: TeamDomainsService) {}

  @Get()
  list(@Param('teamId') teamId: string, @Req() request: RequestWithAuth) {
    return this.teamDomains.list(teamId, request.auth!);
  }

  @Post()
  add(@Param('teamId') teamId: string, @Body() body: unknown, @Req() request: RequestWithAuth) {
    return this.teamDomains.add(teamId, body, request.auth!);
  }

  @Post(':domainId/verify')
  verify(
    @Param('teamId') teamId: string,
    @Param('domainId') domainId: string,
    @Req() request: RequestWithAuth,
  ) {
    return this.teamDomains.verify(teamId, domainId, request.auth!);
  }

  @Delete(':domainId')
  remove(
    @Param('teamId') teamId: string,
    @Param('domainId') domainId: string,
    @Req() request: RequestWithAuth,
  ) {
    return this.teamDomains.remove(teamId, domainId, request.auth!);
  }
}
