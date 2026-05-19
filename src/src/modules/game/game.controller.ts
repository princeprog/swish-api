import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Req } from '@nestjs/common';
import { GameService } from './game.service';
import { CreateGameDto } from './dto/create-game.dto';
import { UpdateGameScoreDto } from './dto/update-game-score.dto';
import { AuthGuard } from '../auth/auth.guard';
import { GenerateRoundRobinDto } from './dto/generate-round-robin.dto';
import { UpdateGameStatusDto } from './dto/update-game-status.dto';
import { InitializeGameDto } from './dto/initialize-game.dto';
import { AddScoringEventDto } from './dto/add-scoring-event.dto';
import { RemoveScoringEventDto } from './dto/remove-scoring-event.dto';
import { AddPlayerStatEventDto } from './dto/add-player-stat-event.dto';
import { LogSubstitutionDto } from './dto/log-substitution.dto';
import { ClockActionDto } from './dto/clock-action.dto';
import { FinalizeGameDto } from './dto/finalize-game.dto';
import { PublishGameSummaryDto } from './dto/publish-game-summary.dto';
import { SetGameAwardsDto } from './dto/set-game-awards.dto';

@UseGuards(AuthGuard)
@Controller('game')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  @Post()
  create(@Body() createGameDto: CreateGameDto, @Req() req: any) {
    const userId = req.user.sub;
    return this.gameService.create(createGameDto, userId);
  }

  @Post('generate-round-robin')
  generateRoundRobin(@Body() dto: GenerateRoundRobinDto, @Req() req: any) {
    const userId = req.user.sub;
    return this.gameService.generateRoundRobinSchedule(dto, userId);
  }

  @Get()
  findAll(@Query('seasonId') seasonId: string, @Req() req: any) {
    const userId = req.user.sub;
    return this.gameService.findAll(+seasonId, userId);
  }

  @Get('schedule-readiness')
  getScheduleReadiness(@Query('seasonId') seasonId: string, @Req() req: any) {
    return this.gameService.getScheduleReadiness(+seasonId, req.user.sub);
  }

  @Patch(':id/score')
  updateScore(
    @Param('id') id: string,
    @Body() updateScoreDto: UpdateGameScoreDto,
    @Req() req: any,
  ) {
    const userId = req.user.sub;
    return this.gameService.updateScore(+id, updateScoreDto, userId);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateGameStatusDto, @Req() req: any) {
    const userId = req.user.sub;
    return this.gameService.updateStatus(+id, dto, userId);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Req() req: any) {
    const userId = req.user.sub;
    return this.gameService.delete(+id, userId);
  }

  @Post(':id/initialize')
  initialize(@Param('id') id: string, @Body() dto: InitializeGameDto, @Req() req: any) {
    const userId = req.user.sub;
    return this.gameService.initializeGame(+id, dto, userId);
  }

  @Post(':id/scoring-events')
  addScoringEvent(@Param('id') id: string, @Body() dto: AddScoringEventDto, @Req() req: any) {
    return this.gameService.addScoringEvent(+id, dto, req.user.sub);
  }

  @Get(':id/scoring-events')
  listScoringEvents(@Param('id') id: string, @Req() req: any) {
    return this.gameService.listScoringEvents(+id, req.user.sub);
  }

  @Delete(':id/scoring-events/:eventId')
  removeScoringEvent(
    @Param('id') id: string,
    @Param('eventId') eventId: string,
    @Body() dto: RemoveScoringEventDto,
    @Req() req: any,
  ) {
    return this.gameService.removeScoringEvent(+id, +eventId, dto, req.user.sub);
  }

  @Post(':id/player-stat-events')
  addPlayerStatEvent(@Param('id') id: string, @Body() dto: AddPlayerStatEventDto, @Req() req: any) {
    return this.gameService.addPlayerStatEvent(+id, dto, req.user.sub);
  }

  @Get(':id/player-stats')
  getPlayerStats(@Param('id') id: string, @Req() req: any) {
    return this.gameService.getPlayerStats(+id, req.user.sub);
  }

  @Post(':id/substitutions')
  logSubstitution(@Param('id') id: string, @Body() dto: LogSubstitutionDto, @Req() req: any) {
    return this.gameService.logSubstitution(+id, dto, req.user.sub);
  }

  @Post(':id/clock')
  clockAction(@Param('id') id: string, @Body() dto: ClockActionDto, @Req() req: any) {
    return this.gameService.clockAction(+id, dto, req.user.sub);
  }

  @Post(':id/finalize')
  finalizeGame(@Param('id') id: string, @Body() dto: FinalizeGameDto, @Req() req: any) {
    return this.gameService.finalizeGame(+id, dto, req.user.sub);
  }

  @Post(':id/summary/publish')
  publishSummary(@Param('id') id: string, @Body() dto: PublishGameSummaryDto, @Req() req: any) {
    return this.gameService.publishGameSummary(+id, dto, req.user.sub);
  }

  @Get(':id/summary/public')
  getPublicSummary(@Param('id') id: string) {
    return this.gameService.getPublicGameSummary(+id);
  }

  @Post(':id/awards')
  setGameAwards(@Param('id') id: string, @Body() dto: SetGameAwardsDto, @Req() req: any) {
    return this.gameService.setGameAwards(+id, dto, req.user.sub);
  }

  @Get('season/:seasonId/awards/leaderboard')
  getSeasonAwardsLeaderboard(@Param('seasonId') seasonId: string, @Req() req: any) {
    return this.gameService.getSeasonAwardsLeaderboard(+seasonId, req.user.sub);
  }
}
