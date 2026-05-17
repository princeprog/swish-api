import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { LeagueService } from './league.service';
import { CreateLeagueDto } from './dto/create-league.dto';
import { UpdateLeagueDto } from './dto/update-league.dto';
import { AuthGuard } from '../auth/auth.guard';

@Controller('league')
export class LeagueController {
  constructor(private readonly leagueService: LeagueService) {}

  @UseGuards(AuthGuard)
  @Post()
  create(@Body() createLeagueDto: CreateLeagueDto, @Req() req: any) {
    const userId = req.user.sub;
    return this.leagueService.create(createLeagueDto, userId);
  }


  @Get()
  findAll() {
    return this.leagueService.findAll();
  }
}


