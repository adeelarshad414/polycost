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
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RequestWithAuth } from './auth.types';
import { SessionAuthGuard } from './session-auth.guard';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() body: unknown, @Req() request?: RequestWithAuth) {
    return this.authService.register(body, requestMetadata(request));
  }

  @Post('login')
  login(@Body() body: unknown, @Req() request?: RequestWithAuth) {
    return this.authService.login(body, requestMetadata(request));
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  me(@Req() request: RequestWithAuth) {
    return this.authService.me(request.auth!);
  }

  @Post('logout')
  @UseGuards(SessionAuthGuard)
  logout(@Req() request: RequestWithAuth) {
    return this.authService.logout(request.auth!);
  }

  @Patch('profile')
  @UseGuards(SessionAuthGuard)
  updateProfile(@Body() body: unknown, @Req() request: RequestWithAuth) {
    return this.authService.updateProfile(body, request.auth!);
  }

  @Post('password')
  @UseGuards(SessionAuthGuard)
  changePassword(@Body() body: unknown, @Req() request: RequestWithAuth) {
    return this.authService.changePassword(body, request.auth!);
  }

  @Delete('account')
  @UseGuards(SessionAuthGuard)
  deleteAccount(@Body() body: unknown, @Req() request: RequestWithAuth) {
    return this.authService.deleteAccount(body, request.auth!);
  }

  @Get('sessions')
  @UseGuards(SessionAuthGuard)
  listSessions(@Req() request: RequestWithAuth) {
    return this.authService.listSessions(request.auth!);
  }

  @Post('sessions/revoke-other')
  @UseGuards(SessionAuthGuard)
  revokeOtherSessions(@Req() request: RequestWithAuth) {
    return this.authService.revokeOtherSessions(request.auth!);
  }

  @Post('teams')
  @UseGuards(SessionAuthGuard)
  createTeam(@Body() body: unknown, @Req() request: RequestWithAuth) {
    return this.authService.createTeam(body, request.auth!);
  }

  @Patch('teams/:teamId')
  @UseGuards(SessionAuthGuard)
  updateTeamSettings(
    @Param('teamId') teamId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth,
  ) {
    return this.authService.updateTeamSettings(teamId, body, request.auth!);
  }

  @Get('teams/:teamId/members')
  @UseGuards(SessionAuthGuard)
  listTeamMembers(@Param('teamId') teamId: string, @Req() request: RequestWithAuth) {
    return this.authService.listTeamMembers(teamId, request.auth!);
  }

  @Patch('teams/:teamId/members/:accountId')
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
  @UseGuards(SessionAuthGuard)
  removeTeamMember(
    @Param('teamId') teamId: string,
    @Param('accountId') accountId: string,
    @Req() request: RequestWithAuth,
  ) {
    return this.authService.removeTeamMember(teamId, accountId, request.auth!);
  }

  @Post('teams/:teamId/invitations')
  @UseGuards(SessionAuthGuard)
  inviteTeamMember(
    @Param('teamId') teamId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth,
  ) {
    return this.authService.inviteTeamMember(teamId, body, request.auth!);
  }

  @Get('teams/:teamId/invitations')
  @UseGuards(SessionAuthGuard)
  listTeamInvitations(@Param('teamId') teamId: string, @Req() request: RequestWithAuth) {
    return this.authService.listTeamInvitations(teamId, request.auth!);
  }

  @Post('teams/:teamId/invitations/:invitationId/revoke')
  @UseGuards(SessionAuthGuard)
  revokeTeamInvitation(
    @Param('teamId') teamId: string,
    @Param('invitationId') invitationId: string,
    @Req() request: RequestWithAuth,
  ) {
    return this.authService.revokeTeamInvitation(teamId, invitationId, request.auth!);
  }

  @Post('invitations/accept')
  @UseGuards(SessionAuthGuard)
  acceptInvitation(@Body() body: unknown, @Req() request: RequestWithAuth) {
    return this.authService.acceptInvitation(body, request.auth!);
  }

  @Get('invitations/preview/:token')
  previewInvitation(@Param('token') token: string) {
    return this.authService.previewInvitation(token);
  }

  @Get('sso/status')
  @UseGuards(SessionAuthGuard)
  ssoStatus(@Req() request: RequestWithAuth) {
    return this.authService.ssoStatus(request.auth!);
  }

  @Post('sso/oidc/start')
  startMockOidcLogin(@Body() body: unknown) {
    return this.authService.startMockOidcLogin(body);
  }

  @Get('sso/mock/oidc/authorize')
  mockOidcAuthorize(@Query() query: Record<string, unknown>) {
    return this.authService.mockOidcAuthorize(query);
  }

  @Get('sso/oidc/callback')
  completeMockOidcCallback(
    @Query() query: Record<string, unknown>,
    @Req() request?: RequestWithAuth,
  ) {
    return this.authService.completeMockOidcCallback(query, requestMetadata(request));
  }

  @Post('teams/:teamId/sso/providers')
  @UseGuards(SessionAuthGuard)
  configureSsoProvider(
    @Param('teamId') teamId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth,
  ) {
    return this.authService.configureSsoProvider(teamId, body, request.auth!);
  }

  @Post('teams/:teamId/sso/test-connection')
  @UseGuards(SessionAuthGuard)
  testSsoConnection(
    @Param('teamId') teamId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth,
  ) {
    return this.authService.testSsoConnection(teamId, body, request.auth!);
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
