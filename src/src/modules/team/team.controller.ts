import { Controller, Get, Post, Body, Param, Query, UseGuards, Req, Delete, Patch } from '@nestjs/common';
import { TeamService } from './team.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { CreateRosterPlayerDto } from './dto/create-roster-player.dto';
import { AuthGuard } from '../auth/auth.guard';
import { CreateTeamStaffDto } from './dto/create-team-staff.dto';
import { UpdateTeamStaffDto } from './dto/update-team-staff.dto';

@UseGuards(AuthGuard)
@Controller('team')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Post()
  create(@Body() createTeamDto: CreateTeamDto, @Req() req: any) {
    const userId = req.user.sub;
    return this.teamService.create(createTeamDto, userId);
  }

  @Get()
  findAll(@Req() req: any) {
    const userId = req.user.sub;
    return this.teamService.findAll(userId);
  }

  @Get(':id/roster')
  getRoster(
    @Param('id') id: string,
    @Query('season_id') seasonId: string,
    @Req() req: any,
  ) {
    return this.teamService.getRoster(+id, +seasonId, req.user.sub);
  }

  @Get('readiness/season')
  getSeasonTeamReadiness(@Query('season_id') seasonId: string, @Req() req: any) {
    return this.teamService.getSeasonTeamReadiness(+seasonId, req.user.sub);
  }

  @Get('eligibility/season')
  getSeasonTeamEligibility(@Query('season_id') seasonId: string, @Req() req: any) {
    return this.teamService.getSeasonTeamEligibility(+seasonId, req.user.sub);
  }

  @Post(':id/roster')
  addRosterPlayer(
    @Param('id') id: string,
    @Body() dto: CreateRosterPlayerDto,
    @Req() req: any,
  ) {
    return this.teamService.addRosterPlayer(+id, dto, req.user.sub);
  }

  @Post(':id/roster/finalize')
  finalizeRoster(
    @Param('id') id: string,
    @Query('season_id') seasonId: string,
    @Req() req: any,
  ) {
    return this.teamService.finalizeRoster(+id, +seasonId, req.user.sub);
  }

  @Post(':id/roster/reopen')
  reopenRoster(
    @Param('id') id: string,
    @Query('season_id') seasonId: string,
    @Req() req: any,
  ) {
    return this.teamService.reopenRoster(+id, +seasonId, req.user.sub);
  }

  @Get(':id/staff')
  listStaff(@Param('id') id: string, @Query('season_id') seasonId: string, @Req() req: any) {
    return this.teamService.listTeamStaff(+id, +seasonId, req.user.sub);
  }

  @Post(':id/staff')
  addStaff(@Param('id') id: string, @Body() dto: CreateTeamStaffDto, @Req() req: any) {
    return this.teamService.addTeamStaff(+id, dto, req.user.sub);
  }

  @Patch(':id/staff/:staffId')
  updateStaff(
    @Param('id') id: string,
    @Param('staffId') staffId: string,
    @Body() dto: UpdateTeamStaffDto,
    @Req() req: any,
  ) {
    return this.teamService.updateTeamStaff(+id, +staffId, dto, req.user.sub);
  }

  @Delete(':id/staff/:staffId')
  removeStaff(@Param('id') id: string, @Param('staffId') staffId: string, @Req() req: any) {
    return this.teamService.removeTeamStaff(+id, +staffId, req.user.sub);
  }
}
