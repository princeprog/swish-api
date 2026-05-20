import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { SuperAdminService } from './super-admin.service';

@Controller('super-admin')
@UseGuards(AuthGuard)
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Get('me')
  me(@Req() req: any) {
    return this.superAdminService.me(req.user.sub);
  }

  @Post('maintenance-lock')
  maintenanceLock(@Req() req: any, @Body() body: { enabled: boolean; reason: string }) {
    return this.superAdminService.setMaintenanceLock(req.user.sub, body.enabled, body.reason);
  }

  @Post('users/:userId/role')
  setRole(@Req() req: any, @Param('userId') userId: string, @Body() body: { role: string; reason: string }) {
    return this.superAdminService.changeUserRole(req.user.sub, userId, body.role, body.reason);
  }

  @Post('users/:userId/revoke-sessions')
  revoke(@Req() req: any, @Param('userId') userId: string, @Body() body: { reason: string }) {
    return this.superAdminService.revokeSessions(req.user.sub, userId, body.reason);
  }

  @Get('users')
  users(@Req() req: any, @Query('email') email?: string) {
    return this.superAdminService.listUsers(req.user.sub, email);
  }

  @Get('league-admins')
  leagueAdmins(@Req() req: any) {
    return this.superAdminService.listLeagueAdmins(req.user.sub);
  }

  @Post('league-admins/:userId/remove')
  removeLeagueAdmin(@Req() req: any, @Param('userId') userId: string, @Body() body: { reason: string }) {
    return this.superAdminService.removeLeagueAdminAndDeleteLeague(req.user.sub, userId, body.reason);
  }

  @Get('invitations')
  invitations(@Req() req: any) {
    return this.superAdminService.listInvitations(req.user.sub);
  }

  @Post('invitations/:id/revoke')
  revokeInvitation(@Req() req: any, @Param('id') id: string, @Body() body: { reason: string }) {
    return this.superAdminService.revokeInvitation(req.user.sub, id, body.reason);
  }

  @Post('invitations/league-admin')
  inviteLeagueAdmin(@Req() req: any, @Body() body: { email: string }) {
    return this.superAdminService.inviteLeagueAdmin(req.user.sub, body.email);
  }

  @Get('audit-log')
  audit(@Req() req: any, @Query() query: { actionType?: string; dateFrom?: string; dateTo?: string }) {
    return this.superAdminService.auditLog(req.user.sub, query);
  }
}
