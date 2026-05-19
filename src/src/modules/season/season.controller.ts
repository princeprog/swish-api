import { Controller, Get, Post, Body, Param, Patch, UseGuards, Req } from '@nestjs/common';
import { SeasonService } from './season.service';
import { CreateSeasonDto } from './dto/create-season.dto';
import { CreateSeasonDivisionDto } from './dto/create-season-division.dto';
import { UpdateSeasonDivisionDto } from './dto/update-season-division.dto';
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
}
