import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema.js';
import { AuthService } from './auth.service.js';
import type { RequestWithAuth } from './auth.types.js';
import {
  ApiRateLimitService,
  requestIdentity,
  writeRateLimitHeaders,
} from './rate-limit.service.js';
import type { RateLimitHeaderResponse } from './rate-limit.service.js';
import { SessionAuthGuard } from './session-auth.guard.js';
import { RouteAccess } from './route-access.js';

@RouteAccess('public')
@Controller('api/v1/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly apiRateLimitService: ApiRateLimitService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  @Post('register')
  async register(
    @Body() body: unknown,
    @Req() request?: RequestWithAuth,
    @Res({ passthrough: true }) response?: RateLimitHeaderResponse,
  ) {
    await this.consumeAuthRateLimit('auth_register', request, response);

    return this.authService.register(body, requestMetadata(request));
  }

  @Post('login')
  async login(
    @Body() body: unknown,
    @Req() request?: RequestWithAuth,
    @Res({ passthrough: true }) response?: RateLimitHeaderResponse,
  ) {
    await this.consumeAuthRateLimit('auth_login', request, response);

    return this.authService.login(body, requestMetadata(request));
  }

  @Get('me')
  @RouteAccess('session')
  @UseGuards(SessionAuthGuard)
  me(@Req() request: RequestWithAuth) {
    return this.authService.me(request.auth!);
  }

  @Post('logout')
  @RouteAccess('session')
  @UseGuards(SessionAuthGuard)
  logout(@Req() request: RequestWithAuth) {
    return this.authService.logout(request.auth!);
  }

  @Patch('profile')
  @RouteAccess('session')
  @UseGuards(SessionAuthGuard)
  updateProfile(@Body() body: unknown, @Req() request: RequestWithAuth) {
    return this.authService.updateProfile(body, request.auth!);
  }

  @Post('password')
  @RouteAccess('session')
  @UseGuards(SessionAuthGuard)
  changePassword(@Body() body: unknown, @Req() request: RequestWithAuth) {
    return this.authService.changePassword(body, request.auth!);
  }

  @Delete('account')
  @RouteAccess('session')
  @UseGuards(SessionAuthGuard)
  deleteAccount(@Body() body: unknown, @Req() request: RequestWithAuth) {
    return this.authService.deleteAccount(body, request.auth!);
  }

  @Get('sessions')
  @RouteAccess('session')
  @UseGuards(SessionAuthGuard)
  listSessions(@Req() request: RequestWithAuth) {
    return this.authService.listSessions(request.auth!);
  }

  @Post('sessions/revoke-other')
  @RouteAccess('session')
  @UseGuards(SessionAuthGuard)
  revokeOtherSessions(@Req() request: RequestWithAuth) {
    return this.authService.revokeOtherSessions(request.auth!);
  }

  @Post('sessions/team')
  @RouteAccess('session')
  @UseGuards(SessionAuthGuard)
  switchActiveTeam(@Body() body: unknown, @Req() request: RequestWithAuth) {
    return this.authService.switchActiveTeam(body, request.auth!);
  }

  @Post('teams')
  @RouteAccess('session')
  @UseGuards(SessionAuthGuard)
  createTeam(@Body() body: unknown, @Req() request: RequestWithAuth) {
    return this.authService.createTeam(body, request.auth!);
  }

  @Patch('teams/:teamId')
  @RouteAccess('session')
  @UseGuards(SessionAuthGuard)
  updateTeamSettings(
    @Param('teamId') teamId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth,
  ) {
    return this.authService.updateTeamSettings(teamId, body, request.auth!);
  }

  @Get('teams/:teamId/members')
  @RouteAccess('session')
  @UseGuards(SessionAuthGuard)
  listTeamMembers(@Param('teamId') teamId: string, @Req() request: RequestWithAuth) {
    return this.authService.listTeamMembers(teamId, request.auth!);
  }

  @Patch('teams/:teamId/members/:accountId')
  @RouteAccess('session')
  @UseGuards(SessionAuthGuard)
  updateTeamMemberRole(
    @Param('teamId') teamId: string,
    @Param('accountId') accountId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth,
  ) {
    return this.authService.updateTeamMemberRole(teamId, accountId, body, request.auth!);
  }

  @Delete('teams/:teamId/members/:accountId')
  @RouteAccess('session')
  @UseGuards(SessionAuthGuard)
  removeTeamMember(
    @Param('teamId') teamId: string,
    @Param('accountId') accountId: string,
    @Req() request: RequestWithAuth,
  ) {
    return this.authService.removeTeamMember(teamId, accountId, request.auth!);
  }

  @Post('teams/:teamId/invitations')
  @RouteAccess('session')
  @UseGuards(SessionAuthGuard)
  inviteTeamMember(
    @Param('teamId') teamId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth,
  ) {
    return this.authService.inviteTeamMember(teamId, body, request.auth!);
  }

  @Get('teams/:teamId/invitations')
  @RouteAccess('session')
  @UseGuards(SessionAuthGuard)
  listTeamInvitations(@Param('teamId') teamId: string, @Req() request: RequestWithAuth) {
    return this.authService.listTeamInvitations(teamId, request.auth!);
  }

  @Get('teams/:teamId/audit-events')
  @RouteAccess('session')
  @UseGuards(SessionAuthGuard)
  listTeamAuditEvents(
    @Param('teamId') teamId: string,
    @Req() request: RequestWithAuth,
    @Query('limit') limit?: string,
  ) {
    return this.authService.listTeamAuditEvents(teamId, request.auth!, optionalLimit(limit));
  }

  @Post('teams/:teamId/invitations/:invitationId/revoke')
  @RouteAccess('session')
  @UseGuards(SessionAuthGuard)
  revokeTeamInvitation(
    @Param('teamId') teamId: string,
    @Param('invitationId') invitationId: string,
    @Req() request: RequestWithAuth,
  ) {
    return this.authService.revokeTeamInvitation(teamId, invitationId, request.auth!);
  }

  @Post('teams/:teamId/invitations/:invitationId/resend')
  @RouteAccess('session')
  @UseGuards(SessionAuthGuard)
  resendTeamInvitation(
    @Param('teamId') teamId: string,
    @Param('invitationId') invitationId: string,
    @Req() request: RequestWithAuth,
  ) {
    return this.authService.resendTeamInvitation(teamId, invitationId, request.auth!);
  }

  @Post('invitations/accept')
  @RouteAccess('session')
  @UseGuards(SessionAuthGuard)
  acceptInvitation(@Body() body: unknown, @Req() request: RequestWithAuth) {
    return this.authService.acceptInvitation(body, request.auth!);
  }

  @Get('invitations/preview/:token')
  async previewInvitation(
    @Param('token') token: string,
    @Req() request?: RequestWithAuth,
    @Res({ passthrough: true }) response?: RateLimitHeaderResponse,
  ) {
    await this.consumeAuthRateLimit('auth_invitation_preview', request, response);

    return this.authService.previewInvitation(token);
  }

  @Get('sso/status')
  @RouteAccess('session')
  @UseGuards(SessionAuthGuard)
  ssoStatus(@Req() request: RequestWithAuth) {
    return this.authService.ssoStatus(request.auth!);
  }

  @Post('sso/oidc/start')
  async startMockOidcLogin(
    @Body() body: unknown,
    @Req() request?: RequestWithAuth,
    @Res({ passthrough: true }) response?: RateLimitHeaderResponse,
  ) {
    await this.consumeAuthRateLimit('auth_sso_start', request, response);

    return this.authService.startMockOidcLogin(body);
  }

  @Get('sso/mock/oidc/authorize')
  async mockOidcAuthorize(
    @Query() query: Record<string, unknown>,
    @Req() request?: RequestWithAuth,
    @Res({ passthrough: true }) response?: RateLimitHeaderResponse,
  ) {
    await this.consumeAuthRateLimit('auth_sso_authorize', request, response);

    return this.authService.mockOidcAuthorize(query);
  }

  @Get('sso/oidc/callback')
  async completeMockOidcCallback(
    @Query() query: Record<string, unknown>,
    @Req() request?: RequestWithAuth,
    @Res({ passthrough: true }) response?: RateLimitHeaderResponse,
  ) {
    await this.consumeAuthRateLimit('auth_sso_callback', request, response);

    return this.authService.completeMockOidcCallback(query, requestMetadata(request));
  }

  @Post('teams/:teamId/sso/providers')
  @RouteAccess('session')
  @UseGuards(SessionAuthGuard)
  configureSsoProvider(
    @Param('teamId') teamId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth,
  ) {
    return this.authService.configureSsoProvider(teamId, body, request.auth!);
  }

  @Post('teams/:teamId/sso/test-connection')
  @RouteAccess('session')
  @UseGuards(SessionAuthGuard)
  async testSsoConnection(
    @Param('teamId') teamId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth,
  ) {
    return this.authService.testSsoConnection(teamId, body, request.auth!);
  }

  private async consumeAuthRateLimit(
    scope: string,
    request: RequestWithAuth | undefined,
    response: RateLimitHeaderResponse | undefined,
  ): Promise<void> {
    const state = await this.apiRateLimitService.consume(
      scope,
      requestIdentity(request ?? {}),
      this.configService.get('RATE_LIMIT_AUTH_PER_MINUTE', { infer: true }),
    );
    writeRateLimitHeaders(response, state);
  }
}

function requestMetadata(request: RequestWithAuth | undefined): {
  ip?: string;
  userAgent?: string;
} {
  const userAgent = userAgentHeader(request?.headers);

  return {
    ...(request?.ip ? { ip: request.ip } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
}

function userAgentHeader(headers: Record<string, unknown> | undefined): string | undefined {
  if (!headers) {
    return undefined;
  }

  const value = headers['user-agent'] ?? headers['User-Agent'];

  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : undefined;
  }

  return typeof value === 'string' ? value : undefined;
}

function optionalLimit(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : undefined;
}
