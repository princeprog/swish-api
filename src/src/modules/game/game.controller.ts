import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Req } from '@nestjs/common';
import { GameService } from './game.service';
import { CreateGameDto } from './dto/create-game.dto';
import { UpdateGameScoreDto } from './dto/update-game-score.dto';
import { AuthGuard } from '../auth/auth.guard';

@UseGuards(AuthGuard)
@Controller('game')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  @Post()
  create(@Body() createGameDto: CreateGameDto, @Req() req: any) {
    const userId = req.user.sub;
    return this.gameService.create(createGameDto, userId);
  }

  @Get()
  findAll(@Query('seasonId') seasonId: string, @Req() req: any) {
    const userId = req.user.sub;
    return this.gameService.findAll(+seasonId, userId);
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

  @Delete(':id')
  delete(@Param('id') id: string, @Req() req: any) {
    const userId = req.user.sub;
    return this.gameService.delete(+id, userId);
  }
}
