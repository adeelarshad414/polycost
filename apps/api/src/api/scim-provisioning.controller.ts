import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RequestWithAuth } from './auth.types';
import { ScimProvisioningService } from './scim-provisioning.service';
import { SessionAuthGuard } from './session-auth.guard';

@Controller('api/v1')
export class ScimProvisioningController {
  constructor(private readonly scimProvisioningService: ScimProvisioningService) {}

  @Get('auth/teams/:teamId/scim/tokens')
  @UseGuards(SessionAuthGuard)
  listTokens(@Param('teamId') teamId: string, @Req() request: RequestWithAuth) {
    return this.scimProvisioningService.listTokens(teamId, request.auth!);
  }

  @Post('auth/teams/:teamId/scim/tokens')
  @UseGuards(SessionAuthGuard)
  createToken(
    @Param('teamId') teamId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth,
  ) {
    return this.scimProvisioningService.createToken(teamId, body, request.auth!);
  }

  @Delete('auth/teams/:teamId/scim/tokens/:tokenId')
  @UseGuards(SessionAuthGuard)
  revokeToken(
    @Param('teamId') teamId: string,
    @Param('tokenId') tokenId: string,
    @Req() request: RequestWithAuth,
  ) {
    return this.scimProvisioningService.revokeToken(teamId, tokenId, request.auth!);
  }

  @Get('scim/v2/ServiceProviderConfig')
  serviceProviderConfig(@Req() request: RequestWithAuth) {
    return this.scimProvisioningService.serviceProviderConfig(request);
  }

  @Get('scim/v2/Users')
  listUsers(@Req() request: RequestWithAuth) {
    return this.scimProvisioningService.listUsers(request);
  }

  @Post('scim/v2/Users')
  createUser(@Body() body: unknown, @Req() request: RequestWithAuth) {
    return this.scimProvisioningService.createUser(body, request);
  }

  @Get('scim/v2/Users/:userId')
  getUser(@Param('userId') userId: string, @Req() request: RequestWithAuth) {
    return this.scimProvisioningService.getUser(userId, request);
  }

  @Put('scim/v2/Users/:userId')
  replaceUser(
    @Param('userId') userId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth,
  ) {
    return this.scimProvisioningService.replaceUser(userId, body, request);
  }

  @Patch('scim/v2/Users/:userId')
  patchUser(
    @Param('userId') userId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth,
  ) {
    return this.scimProvisioningService.patchUser(userId, body, request);
  }

  @Delete('scim/v2/Users/:userId')
  deactivateUser(@Param('userId') userId: string, @Req() request: RequestWithAuth) {
    return this.scimProvisioningService.deactivateUser(userId, request);
  }
}
