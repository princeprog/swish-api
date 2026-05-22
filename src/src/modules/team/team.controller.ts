import { Controller, Get, Post, Body, Param, Query, UseGuards, Req, Delete, Patch, UploadedFile, UseInterceptors } from '@nestjs/common';
import { TeamService } from './team.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { CreateRosterPlayerDto } from './dto/create-roster-player.dto';
import { AuthGuard } from '../auth/auth.guard';
import { CreateTeamStaffDto } from './dto/create-team-staff.dto';
import { UpdateTeamStaffDto } from './dto/update-team-staff.dto';
import { UpsertComplianceStatusDto } from './dto/upsert-compliance-status.dto';
import { UpsertSeasonTeamIdentityDto } from './dto/upsert-season-team-identity.dto';
import { UpsertTeamAvailabilityDto } from './dto/upsert-team-availability.dto';
import { FileInterceptor } from '@nestjs/platform-express';

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

  @Get(':id/compliance')
  listCompliance(@Param('id') id: string, @Query('season_id') seasonId: string, @Req() req: any) {
    return this.teamService.listTeamCompliance(+id, +seasonId, req.user.sub);
  }

  @Post(':id/compliance')
  upsertCompliance(
    @Param('id') id: string,
    @Query('season_id') seasonId: string,
    @Body() dto: UpsertComplianceStatusDto,
    @Req() req: any,
  ) {
    return this.teamService.upsertTeamComplianceStatus(+id, +seasonId, dto, req.user.sub);
  }

  @Post(':id/compliance/:itemId/save-evidence')
  saveEvidence(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Query('season_id') seasonId: string,
    @Body() body: { attachments?: any[]; notes?: string | null },
    @Req() req: any,
  ) {
    return this.teamService.saveComplianceEvidence(+id, +seasonId, +itemId, body, req.user.sub);
  }

  @Post(':id/compliance/:itemId/submit')
  submitEvidenceItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Query('season_id') seasonId: string,
    @Body() body: { notes?: string | null },
    @Req() req: any,
  ) {
    return this.teamService.submitComplianceEvidence(+id, +seasonId, +itemId, body, req.user.sub);
  }

  @Delete(':id/compliance/:itemId/evidence/:index')
  removeEvidenceItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Param('index') index: string,
    @Query('season_id') seasonId: string,
    @Req() req: any,
  ) {
    return this.teamService.removeComplianceEvidence(+id, +seasonId, +itemId, +index, req.user.sub);
  }

  @Post(':id/compliance/:itemId/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
        cb(null, allowed.includes(file.mimetype));
      },
    }),
  )
  uploadComplianceEvidence(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Query('season_id') seasonId: string,
    @UploadedFile() file: any,
    @Req() req: any,
  ) {
    return this.teamService.uploadComplianceEvidence(+id, +seasonId, +itemId, file, req.user.sub);
  }

  @Post(':id/compliance/:itemId/approve')
  approveComplianceItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Query('season_id') seasonId: string,
    @Req() req: any,
  ) {
    return this.teamService.approveComplianceItem(+id, +seasonId, +itemId, req.user.sub);
  }

  @Post(':id/compliance/:itemId/reject')
  rejectComplianceItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Query('season_id') seasonId: string,
    @Body() body: { remarks?: string | null },
    @Req() req: any,
  ) {
    return this.teamService.rejectComplianceItem(+id, +seasonId, +itemId, body?.remarks ?? null, req.user.sub);
  }

  @Get(':id/identity')
  getSeasonTeamIdentity(@Param('id') id: string, @Query('season_id') seasonId: string, @Req() req: any) {
    return this.teamService.getSeasonTeamIdentity(+id, +seasonId, req.user.sub);
  }

  @Post(':id/identity')
  upsertSeasonTeamIdentity(
    @Param('id') id: string,
    @Query('season_id') seasonId: string,
    @Body() dto: UpsertSeasonTeamIdentityDto,
    @Req() req: any,
  ) {
    return this.teamService.upsertSeasonTeamIdentity(+id, +seasonId, dto, req.user.sub);
  }

  @Get(':id/availability')
  getTeamAvailability(@Param('id') id: string, @Query('season_id') seasonId: string, @Req() req: any) {
    return this.teamService.getTeamAvailability(+id, +seasonId, req.user.sub);
  }

  @Post(':id/availability')
  upsertTeamAvailability(
    @Param('id') id: string,
    @Query('season_id') seasonId: string,
    @Body() dto: UpsertTeamAvailabilityDto,
    @Req() req: any,
  ) {
    return this.teamService.upsertTeamAvailability(+id, +seasonId, dto, req.user.sub);
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

  @Post(':id/review/submit')
  submitForReview(@Param('id') id: string, @Query('season_id') seasonId: string, @Req() req: any) {
    return this.teamService.submitTeamForReview(+id, +seasonId, req.user.sub);
  }

  @Post(':id/review/approve')
  approveForSeason(@Param('id') id: string, @Query('season_id') seasonId: string, @Req() req: any) {
    return this.teamService.approveTeamForSeason(+id, +seasonId, req.user.sub);
  }

  @Post(':id/review/reject')
  rejectForSeason(
    @Param('id') id: string,
    @Query('season_id') seasonId: string,
    @Body() body: { review_notes?: string | null },
    @Req() req: any,
  ) {
    return this.teamService.rejectTeamForSeason(+id, +seasonId, body?.review_notes ?? null, req.user.sub);
  }

  @Post(':id/review/reopen')
  reopenReview(@Param('id') id: string, @Query('season_id') seasonId: string, @Req() req: any) {
    return this.teamService.reopenTeamReview(+id, +seasonId, req.user.sub);
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
