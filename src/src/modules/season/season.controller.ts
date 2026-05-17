import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { SeasonService } from './season.service';
import { CreateSeasonDto } from './dto/create-season.dto';
import { AuthGuard } from '../auth/auth.guard';

@UseGuards(AuthGuard)
@Controller('season')
export class SeasonController {
  constructor(private readonly seasonService: SeasonService) {}

  @Post()
  create(@Body() createSeasonDto: CreateSeasonDto, @Req() req: any) {
    const userId = req.user.sub;
    return this.seasonService.create(createSeasonDto, userId);
  }

  @Get()
  findAll(@Req() req: any) {
    const userId = req.user.sub;
    return this.seasonService.findForLeague(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: any) {
    const userId = req.user.sub;
    return this.seasonService.findOne(+id, userId);
  }
}
