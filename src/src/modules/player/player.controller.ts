import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { PlayerService } from './player.service';
import { AuthGuard } from '../auth/auth.guard';

@UseGuards(AuthGuard)
@Controller('player')
export class PlayerController {
  constructor(private readonly playerService: PlayerService) {}

  @Get(':id/profile')
  getPlayerProfile(@Param('id') id: string, @Req() req: any) {
    return this.playerService.getPlayerProfile(+id, req.user.sub);
  }

  @Get(':id/per-game')
  getPerGame(@Param('id') id: string, @Query('seasonId') seasonId: string, @Req() req: any) {
    return this.playerService.getPerGameStats(+id, seasonId ? +seasonId : null, req.user.sub);
  }
}
