import { Controller, Get, Post, Body, Param, Patch, UseGuards, Req, Delete, Query } from '@nestjs/common';
import { SeasonService } from './season.service';
import { CreateSeasonDto } from './dto/create-season.dto';
import { CreateSeasonDivisionDto } from './dto/create-season-division.dto';
import { UpdateSeasonDivisionDto } from './dto/update-season-division.dto';
import { CreateComplianceItemDto } from './dto/create-compliance-item.dto';
import { UpdateComplianceItemDto } from './dto/update-compliance-item.dto';
import { CreateRequiredRoleDto } from './dto/create-required-role.dto';
import { UpdateRequiredRoleDto } from './dto/update-required-role.dto';
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

  @Patch(':id/archive')
  archive(@Param('id') id: string, @Req() req: any) {
    const userId = req.user.sub;
    return this.seasonService.archive(+id, userId);
  }

  @Delete(':id')
  deleteSeason(@Param('id') id: string, @Req() req: any) {
    const userId = req.user.sub;
    return this.seasonService.deleteSeason(+id, userId);
  }

  @Get(':id/divisions')
  listDivisions(@Param('id') id: string, @Req() req: any) {
    return this.seasonService.listDivisions(+id, req.user.sub);
  }

  @Post(':id/divisions')
  createDivision(@Param('id') id: string, @Body() dto: CreateSeasonDivisionDto, @Req() req: any) {
    return this.seasonService.createDivision(+id, dto, req.user.sub);
  }

  @Patch(':id/divisions/:divisionId')
  updateDivision(
    @Param('id') id: string,
    @Param('divisionId') divisionId: string,
    @Body() dto: UpdateSeasonDivisionDto,
    @Req() req: any,
  ) {
    return this.seasonService.updateDivision(+id, +divisionId, dto, req.user.sub);
  }

  @Patch(':id/divisions/:divisionId/archive')
  archiveDivision(@Param('id') id: string, @Param('divisionId') divisionId: string, @Req() req: any) {
    return this.seasonService.archiveDivision(+id, +divisionId, req.user.sub);
  }

  @Get(':id/teams')
  listSeasonTeams(@Param('id') id: string, @Req() req: any) {
    return this.seasonService.listSeasonTeams(+id, req.user.sub);
  }

  @Patch(':id/teams/:teamId/division')
  setSeasonTeamDivision(
    @Param('id') id: string,
    @Param('teamId') teamId: string,
    @Body() body: { division_id: number },
    @Req() req: any,
  ) {
    return this.seasonService.setSeasonTeamDivision(+id, +teamId, body?.division_id, req.user.sub);
  }

  // Compliance items (league_admin only)
  @Get(':id/compliance-items')
  listComplianceItems(@Param('id') id: string, @Req() req: any, @Query('includeArchived') includeArchived?: string) {
    return this.seasonService.listComplianceItems(+id, req.user.sub, includeArchived === 'true');
  }

  @Post(':id/compliance-items')
  createComplianceItem(@Param('id') id: string, @Body() dto: CreateComplianceItemDto, @Req() req: any) {
    return this.seasonService.createComplianceItem(+id, dto, req.user.sub);
  }

  @Patch(':id/compliance-items/:itemId')
  updateComplianceItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateComplianceItemDto,
    @Req() req: any,
  ) {
    return this.seasonService.updateComplianceItem(+id, +itemId, dto, req.user.sub);
  }

  @Patch(':id/compliance-items/:itemId/archive')
  archiveComplianceItem(@Param('id') id: string, @Param('itemId') itemId: string, @Req() req: any) {
    return this.seasonService.archiveComplianceItem(+id, +itemId, req.user.sub);
  }

  @Delete(':id/compliance-items/:itemId')
  deleteComplianceItem(@Param('id') id: string, @Param('itemId') itemId: string, @Req() req: any) {
    return this.seasonService.deleteComplianceItem(+id, +itemId, req.user.sub);
  }

  // Required staff roles (league_admin only)
  @Get(':id/required-staff-roles')
  listRequiredStaffRoles(@Param('id') id: string, @Req() req: any) {
    return this.seasonService.listRequiredStaffRoles(+id, req.user.sub);
  }

  @Post(':id/required-staff-roles')
  createRequiredStaffRole(@Param('id') id: string, @Body() dto: CreateRequiredRoleDto, @Req() req: any) {
    return this.seasonService.createRequiredStaffRole(+id, dto, req.user.sub);
  }

  @Patch(':id/required-staff-roles/:roleId')
  updateRequiredStaffRole(
    @Param('id') id: string,
    @Param('roleId') roleId: string,
    @Body() dto: UpdateRequiredRoleDto,
    @Req() req: any,
  ) {
    return this.seasonService.updateRequiredStaffRole(+id, +roleId, dto, req.user.sub);
  }

  @Delete(':id/required-staff-roles/:roleId')
  deleteRequiredStaffRole(@Param('id') id: string, @Param('roleId') roleId: string, @Req() req: any) {
    return this.seasonService.deleteRequiredStaffRole(+id, +roleId, req.user.sub);
  }
}
