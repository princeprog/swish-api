import { Body, Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { LeagueService } from './league.service';
import { CreateLeagueDto } from './dto/create-league.dto';
import { AuthGuard } from '../auth/auth.guard';
import { CreateLeagueInviteDto } from './dto/create-league-invite.dto';
import { LeagueInvitationService } from './league-invitation.service';
import type { Response } from 'express';

@Controller('league')
export class LeagueController {
  constructor(
    private readonly leagueService: LeagueService,
    private readonly leagueInvitationService: LeagueInvitationService,
  ) {}

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

  @UseGuards(AuthGuard)
  @Post('invitations')
  createInvite(@Body() dto: CreateLeagueInviteDto, @Req() req: any) {
    return this.leagueInvitationService.createInvitation(req.user.sub, dto);
  }

  @UseGuards(AuthGuard)
  @Get('invitations')
  listInvitations(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.leagueInvitationService.listInvitations(
      req.user.sub,
      page ? Number(page) : 1,
      limit ? Number(limit) : 10,
    );
  }

  @UseGuards(AuthGuard)
  @Get('members/summary')
  getMemberSummary(@Req() req: any) {
    return this.leagueService.getMemberRoleSummary(req.user.sub);
  }

  @Get('invitations/verify')
  async verifyInvitation(@Query('token') token: string, @Res({ passthrough: true }) res: Response) {
    const result = await this.leagueInvitationService.verifyInvitation(token);
    return res.redirect(302, result.redirectTo);
  }
}


