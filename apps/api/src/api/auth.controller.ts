import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
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
