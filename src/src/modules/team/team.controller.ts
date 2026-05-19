import { Controller, Get, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { TeamService } from './team.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { CreateRosterPlayerDto } from './dto/create-roster-player.dto';
import { AuthGuard } from '../auth/auth.guard';

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
}
