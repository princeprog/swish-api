import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { TeamService } from './team.service';
import { AuthGuard } from '../auth/auth.guard';

@UseGuards(AuthGuard)
@Controller('team-stats')
export class TeamStatsController {
  constructor(private readonly teamService: TeamService) {}

  @Get('season')
  getSeasonTeamStats(@Query('seasonId') seasonId: string, @Req() req: any) {
    return this.teamService.getSeasonTeamStats(+seasonId, req.user.sub);
  }

  @Get('head-to-head')
  getHeadToHead(
    @Query('seasonId') seasonId: string,
    @Query('teamA') teamA: string,
    @Query('teamB') teamB: string,
    @Req() req: any,
  ) {
    return this.teamService.getHeadToHead(+seasonId, +teamA, +teamB, req.user.sub);
  }
}
