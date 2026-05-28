import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import { DB } from 'src/database/db';
import { CreateSeasonDto } from './dto/create-season.dto';
import { UpdateSeasonDto } from './dto/update-season.dto';
import { getUserLeagueMembership } from '../league/league-membership';
import { CreateSeasonDivisionDto } from './dto/create-season-division.dto';
import { UpdateSeasonDivisionDto } from './dto/update-season-division.dto';
import { CreateComplianceItemDto } from './dto/create-compliance-item.dto';
import { UpdateComplianceItemDto } from './dto/update-compliance-item.dto';

const DEFAULT_SEASON_COMPLIANCE_ITEMS = [
  {
    key: 'roster_size_requirement',
    label: 'Roster Minimum and Maximum',
    category: 'roster',
    sort_order: 0,
    config: {
      validation_mode: 'auto',
      auto_source: 'roster_count',
      roster_rules: { min_players: 5, max_players: 15 },
    },
  },
  {
    key: 'proof_of_entrance_registration',
    label: 'Proof of Entrance Registration',
    category: 'fees',
    sort_order: 1,
    config: {
      validation_mode: 'evidence',
      evidence_rules: { min_files: 1, allow_notes: true },
    },
  },
  {
    key: 'team_identity',
    label: 'Team Identity Completed',
    category: 'identity',
    sort_order: 2,
    config: {
      validation_mode: 'auto',
      auto_source: 'team_identity',
    },
  },
  {
    key: 'uniform_set',
    label: 'Uniform Set Confirmed',
    category: 'uniform',
    sort_order: 3,
    config: {
      validation_mode: 'evidence',
      evidence_rules: { min_files: 1, allow_notes: true },
    },
  },
  {
    key: 'player_eligibility_documents',
    label: 'Player Eligibility Documents',
    category: 'eligibility',
    sort_order: 4,
    config: {
      validation_mode: 'evidence',
      evidence_rules: { min_files: 1, allow_notes: true },
    },
  },
] as const;

@Injectable()
export class SeasonService {
  private readonly allowedPlayoffFormats = new Set([
    'single_elimination',
    'double_elimination',
    'round_robin_finals',
    'twice_to_beat',
    'best_of_three',
    'best_of_five',
    'best_of_seven',
    'stepladder',
  ]);

  constructor(@Inject('KYSELY_DB') private readonly db: Kysely<DB>) {}

  async create(createSeasonDto: CreateSeasonDto, userId: string) {
    const membership = await this.assertLeagueAdmin(userId);

    this.validateSeasonInput(createSeasonDto);

    // 2. Insert season
    const season = await this.db
      .insertInto('league.Season')
      .values({
        league_id: membership.league_id,
        name: createSeasonDto.name,
        start_date: createSeasonDto.start_date as any,
        end_date: createSeasonDto.end_date as any,
        playoff_format: createSeasonDto.playoff_format,
        status: 1 as any, // 1 = Active / Draft
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    if (createSeasonDto.create_default_requirements !== false) {
      await this.seedDefaultSeasonRequirements(Number(season.id), membership.league_id);
    }

    return {
      success: true,
      season,
    };
  }

  async findForLeague(userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);

    if (!membership) {
      return [];
    }

    const seasons = await this.db
      .selectFrom('league.Season')
      .selectAll()
      .where('league_id', '=', membership.league_id)
      .orderBy('start_date', 'desc')
      .execute();

    if (seasons.length === 0) return seasons as any;

    const setupSummaryBySeasonId = await this.buildSeasonSetupSummaryBySeasonIds(
      membership.league_id,
      seasons.map((season: any) => Number(season.id)),
    );

    return seasons.map((season: any) => {
      const summary = setupSummaryBySeasonId.get(Number(season.id)) ?? {
        divisions_count: 0,
        required_compliance_count: 0,
      };
      const hasBasics = Boolean(season.name && season.start_date && season.end_date && season.playoff_format);
      return {
        ...season,
        divisions_count: summary.divisions_count,
        required_compliance_count: summary.required_compliance_count,
        setup_complete: hasBasics && summary.divisions_count > 0 && summary.required_compliance_count > 0,
      };
    });
  }

  async findOne(id: number, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);

    if (!membership) {
      throw new UnauthorizedException('User has no league configured.');
    }

    const season = await this.db
      .selectFrom('league.Season')
      .selectAll()
      .where('id', '=', id)
      .where('league_id', '=', membership.league_id)
      .executeTakeFirst();

    if (!season) return season;

    const setupSummaryBySeasonId = await this.buildSeasonSetupSummaryBySeasonIds(
      membership.league_id,
      [Number(id)],
    );
    const summary = setupSummaryBySeasonId.get(Number(id)) ?? {
      divisions_count: 0,
      required_compliance_count: 0,
    };
    const hasBasics = Boolean(season.name && season.start_date && season.end_date && season.playoff_format);
    return {
      ...season,
      divisions_count: summary.divisions_count,
      required_compliance_count: summary.required_compliance_count,
      setup_complete: hasBasics && summary.divisions_count > 0 && summary.required_compliance_count > 0,
    };
  }

  async update(id: number, dto: UpdateSeasonDto, userId: string) {
    const membership = await this.assertLeagueAdmin(userId);

    this.validateSeasonInput(dto);

    const season = await this.db
      .selectFrom('league.Season')
      .selectAll()
      .where('id', '=', id)
      .where('league_id', '=', membership.league_id)
      .executeTakeFirst();

    if (!season) {
      throw new NotFoundException('Season not found.');
    }

    const updated = await this.db
      .updateTable('league.Season')
      .set({
        name: dto.name.trim() as any,
        start_date: dto.start_date as any,
        end_date: dto.end_date as any,
        playoff_format: dto.playoff_format as any,
      })
      .where('id', '=', id)
      .where('league_id', '=', membership.league_id)
      .returningAll()
      .executeTakeFirst();

    if (!updated) {
      throw new NotFoundException('Season not found.');
    }

    return {
      success: true,
      season: updated,
    };
  }

  async archive(id: number, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);

    if (!membership) {
      throw new ForbiddenException('Only league admins can archive seasons.');
    }

    if (membership.role !== 'league_admin') {
      throw new ForbiddenException('Only league admins can archive seasons.');
    }

    const season = await this.db
      .selectFrom('league.Season')
      .selectAll()
      .where('id', '=', id)
      .where('league_id', '=', membership.league_id)
      .executeTakeFirst();

    if (!season) {
      throw new NotFoundException('Season not found.');
    }

    if (Number(season.status) === 3) {
      throw new BadRequestException('Season is already archived.');
    }

    const updated = await this.db
      .updateTable('league.Season')
      .set({ status: 3 as any })
      .where('id', '=', id)
      .where('league_id', '=', membership.league_id)
      .returningAll()
      .executeTakeFirst();

    if (!updated) {
      throw new NotFoundException('Season not found.');
    }

    return {
      success: true,
      season: updated,
    };
  }

  async deleteSeason(id: number, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);

    if (!membership || membership.role !== 'league_admin') {
      throw new ForbiddenException('Only league admins can delete seasons.');
    }

    const season = await this.db
      .selectFrom('league.Season')
      .select(['id', 'league_id'])
      .where('id', '=', id)
      .where('league_id', '=', membership.league_id)
      .executeTakeFirst();

    if (!season) {
      throw new NotFoundException('Season not found.');
    }

    const gamesCountRow = await this.db
      .selectFrom('game.Game')
      .select((eb) => eb.fn.count('id').as('count'))
      .where('season_id', '=', id)
      .executeTakeFirst();
    const teamsCountRow = await this.db
      .selectFrom('league.SeasonTeam')
      .select((eb) => eb.fn.count('team_id').as('count'))
      .where('season_id', '=', id)
      .executeTakeFirst();

    const gamesCount = Number((gamesCountRow as any)?.count ?? 0);
    const teamsCount = Number((teamsCountRow as any)?.count ?? 0);

    if (gamesCount > 0 || teamsCount > 0) {
      throw new BadRequestException(
        'Season cannot be deleted once teams or games are registered. Archive the season instead.',
      );
    }

    await this.db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom('league.team_compliance_status')
        .where('season_id', '=', id)
        .execute();
      await trx
        .deleteFrom('league.team_staff')
        .where('season_id', '=', id)
        .execute();
      await trx
        .deleteFrom('league.team_availability')
        .where('season_id', '=', id)
        .execute();
      await trx
        .deleteFrom('league.season_team_identity')
        .where('season_id', '=', id)
        .execute();
      await trx
        .deleteFrom('league.team_staff_required_roles')
        .where('season_id', '=', id)
        .execute();
      await trx
        .deleteFrom('league.team_compliance_items')
        .where('season_id', '=', id)
        .execute();
      await trx
        .deleteFrom('league.SeasonDivision')
        .where('season_id', '=', id)
        .execute();
      await trx
        .deleteFrom('league.Season')
        .where('id', '=', id)
        .where('league_id', '=', membership.league_id)
        .execute();
    });

    return { success: true };
  }

  private async assertLeagueAdmin(userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership || membership.role !== 'league_admin') {
      throw new ForbiddenException('Only league admins can manage seasons.');
    }
    return membership;
  }

  async listDivisions(seasonId: number, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership) return [];

    const season = await this.db
      .selectFrom('league.Season')
      .select(['id'])
      .where('id', '=', seasonId)
      .where('league_id', '=', membership.league_id)
      .executeTakeFirst();

    if (!season) throw new NotFoundException('Season not found.');

    return this.db
      .selectFrom('league.SeasonDivision')
      .selectAll()
      .where('season_id', '=', seasonId)
      .where('archived_at', 'is', null)
      .orderBy('sort_order', 'asc')
      .orderBy('id', 'asc')
      .execute();
  }

  async createDivision(seasonId: number, dto: CreateSeasonDivisionDto, userId: string) {
    const membership = await this.assertLeagueAdmin(userId);

    const season = await this.db
      .selectFrom('league.Season')
      .select(['id'])
      .where('id', '=', seasonId)
      .where('league_id', '=', membership.league_id)
      .executeTakeFirst();

    if (!season) throw new NotFoundException('Season not found.');

    const name = (dto.name ?? '').trim();
    const code = (dto.code ?? '').trim();
    if (!name) throw new BadRequestException('name is required.');
    if (!code) throw new BadRequestException('code is required.');

    const division = await this.db
      .insertInto('league.SeasonDivision')
      .values({
        season_id: seasonId,
        name,
        code,
        description: dto.description?.trim() || null,
        sort_order: dto.sort_order ?? 0,
        age_min: dto.age_min ?? null,
        age_max: dto.age_max ?? null,
        is_open: dto.is_open ?? false,
        team_capacity: dto.team_capacity ?? null,
        rules_config: (dto.rules_config ?? {}) as any,
        archived_at: null,
      } as any)
      .returningAll()
      .executeTakeFirstOrThrow();

    return { success: true, division };
  }

  async updateDivision(seasonId: number, divisionId: number, dto: UpdateSeasonDivisionDto, userId: string) {
    const membership = await this.assertLeagueAdmin(userId);

    const season = await this.db
      .selectFrom('league.Season')
      .select(['id'])
      .where('id', '=', seasonId)
      .where('league_id', '=', membership.league_id)
      .executeTakeFirst();

    if (!season) throw new NotFoundException('Season not found.');

    const existing = await this.db
      .selectFrom('league.SeasonDivision')
      .select(['id'])
      .where('id', '=', divisionId)
      .where('season_id', '=', seasonId)
      .where('archived_at', 'is', null)
      .executeTakeFirst();

    if (!existing) throw new NotFoundException('Division not found.');

    const patch: any = {};
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.code !== undefined) patch.code = dto.code.trim();
    if (dto.description !== undefined) patch.description = dto.description?.trim() || null;
    if (dto.sort_order !== undefined) patch.sort_order = dto.sort_order;
    if (dto.age_min !== undefined) patch.age_min = dto.age_min;
    if (dto.age_max !== undefined) patch.age_max = dto.age_max;
    if (dto.is_open !== undefined) patch.is_open = dto.is_open;
    if (dto.team_capacity !== undefined) patch.team_capacity = dto.team_capacity;
    if (dto.rules_config !== undefined) patch.rules_config = (dto.rules_config ?? {}) as any;

    if (Object.keys(patch).length === 0) return { success: true };

    await this.db
      .updateTable('league.SeasonDivision')
      .set(patch)
      .where('id', '=', divisionId)
      .where('season_id', '=', seasonId)
      .execute();

    return { success: true };
  }

  async archiveDivision(seasonId: number, divisionId: number, userId: string) {
    const membership = await this.assertLeagueAdmin(userId);

    const season = await this.db
      .selectFrom('league.Season')
      .select(['id'])
      .where('id', '=', seasonId)
      .where('league_id', '=', membership.league_id)
      .executeTakeFirst();

    if (!season) throw new NotFoundException('Season not found.');

    await this.db
      .updateTable('league.SeasonDivision')
      .set({ archived_at: sql`now()` } as any)
      .where('id', '=', divisionId)
      .where('season_id', '=', seasonId)
      .execute();

    return { success: true };
  }

  async deleteDivision(seasonId: number, divisionId: number, userId: string) {
    const membership = await this.assertLeagueAdmin(userId);

    const season = await this.db
      .selectFrom('league.Season')
      .select(['id'])
      .where('id', '=', seasonId)
      .where('league_id', '=', membership.league_id)
      .executeTakeFirst();

    if (!season) throw new NotFoundException('Season not found.');

    const existing = await this.db
      .selectFrom('league.SeasonDivision')
      .select(['id'])
      .where('id', '=', divisionId)
      .where('season_id', '=', seasonId)
      .executeTakeFirst();

    if (!existing) throw new NotFoundException('Division not found.');

    const assignedTeams = await this.db
      .selectFrom('league.SeasonTeam')
      .select((eb) => eb.fn.count('team_id').as('count'))
      .where('season_id', '=', seasonId)
      .where('division_id', '=', divisionId)
      .executeTakeFirst();

    if (Number((assignedTeams as any)?.count ?? 0) > 0) {
      throw new BadRequestException(
        'This division cannot be removed because teams are already assigned to it.',
      );
    }

    const scopedRequirements = await this.db
      .selectFrom('league.team_compliance_items')
      .select((eb) => eb.fn.count('id').as('count'))
      .where('season_id', '=', seasonId)
      .where('league_id', '=', membership.league_id)
      .where('division_id', '=', divisionId)
      .executeTakeFirst();

    if (Number((scopedRequirements as any)?.count ?? 0) > 0) {
      throw new BadRequestException(
        'This division cannot be removed because season requirements are scoped to it.',
      );
    }

    await this.db
      .deleteFrom('league.SeasonDivision')
      .where('id', '=', divisionId)
      .where('season_id', '=', seasonId)
      .execute();

    return { success: true };
  }

  async listSeasonTeams(seasonId: number, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership) return [];

    const season = await this.db
      .selectFrom('league.Season')
      .select(['id'])
      .where('id', '=', seasonId)
      .where('league_id', '=', membership.league_id)
      .executeTakeFirst();

    if (!season) throw new NotFoundException('Season not found.');

    return this.db
      .selectFrom('league.SeasonTeam as st')
      .innerJoin('league.Teams as t', 't.id', 'st.team_id')
      .leftJoin('league.SeasonDivision as d', 'd.id', 'st.division_id')
      .select([
        'st.season_id',
        'st.team_id',
        'st.division_id',
        't.name as team_name',
        't.abbreviation as team_abbreviation',
        'd.name as division_name',
        'd.code as division_code',
      ])
      .where('st.season_id', '=', seasonId)
      .orderBy('t.name', 'asc')
      .execute();
  }

  async setSeasonTeamDivision(seasonId: number, teamId: number, divisionId: number, userId: string) {
    const membership = await this.assertLeagueAdmin(userId);

    const season = await this.db
      .selectFrom('league.Season')
      .select(['id'])
      .where('id', '=', seasonId)
      .where('league_id', '=', membership.league_id)
      .executeTakeFirst();
    if (!season) throw new NotFoundException('Season not found.');

    const division = await this.db
      .selectFrom('league.SeasonDivision')
      .select(['id'])
      .where('id', '=', divisionId)
      .where('season_id', '=', seasonId)
      .where('archived_at', 'is', null)
      .executeTakeFirst();
    if (!division) throw new NotFoundException('Division not found for this season.');

    const seasonTeam = await this.db
      .selectFrom('league.SeasonTeam')
      .select(['season_id'])
      .where('season_id', '=', seasonId)
      .where('team_id', '=', teamId)
      .executeTakeFirst();
    if (!seasonTeam) throw new NotFoundException('Team is not registered for this season.');

    await this.db
      .updateTable('league.SeasonTeam')
      .set({ division_id: divisionId } as any)
      .where('season_id', '=', seasonId)
      .where('team_id', '=', teamId)
      .execute();

    return { success: true };
  }

  private validateSeasonInput(dto: Pick<CreateSeasonDto, 'name' | 'start_date' | 'end_date' | 'playoff_format'>) {
    if (!dto.name?.trim()) {
      throw new BadRequestException('Season name is required.');
    }

    const startDate = new Date(dto.start_date);
    const endDate = new Date(dto.end_date);

    if (Number.isNaN(startDate.getTime())) {
      throw new BadRequestException('start_date must be a valid date.');
    }

    if (Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('end_date must be a valid date.');
    }

    if (startDate.getTime() > endDate.getTime()) {
      throw new BadRequestException('end_date must be on or after start_date.');
    }

    if (!this.allowedPlayoffFormats.has(dto.playoff_format)) {
      throw new BadRequestException('playoff_format is not supported.');
    }
  }

  private async buildSeasonSetupSummaryBySeasonIds(leagueId: number, seasonIds: number[]) {
    if (seasonIds.length === 0) {
      return new Map<number, { divisions_count: number; required_compliance_count: number }>();
    }

    const activeDivisions = await this.db
      .selectFrom('league.SeasonDivision')
      .select(['season_id'])
      .select((eb) => eb.fn.count('id').as('count'))
      .where('season_id', 'in', seasonIds as any)
      .where('archived_at', 'is', null)
      .groupBy('season_id')
      .execute();

    const requiredComplianceItems = await this.db
      .selectFrom('league.team_compliance_items')
      .select(['season_id'])
      .select((eb) => eb.fn.count('id').as('count'))
      .where('league_id', '=', leagueId)
      .where('season_id', 'in', seasonIds as any)
      .where('archived_at', 'is', null)
      .where('is_required', '=', true)
      .groupBy('season_id')
      .execute();

    const divisionCountBySeasonId = new Map<number, number>(
      activeDivisions.map((row: any) => [Number(row.season_id), Number(row.count ?? 0)]),
    );
    const requiredComplianceBySeasonId = new Map<number, number>(
      requiredComplianceItems.map((row: any) => [Number(row.season_id), Number(row.count ?? 0)]),
    );

    const summaryBySeasonId = new Map<number, { divisions_count: number; required_compliance_count: number }>();
    for (const seasonId of seasonIds) {
      summaryBySeasonId.set(Number(seasonId), {
        divisions_count: divisionCountBySeasonId.get(Number(seasonId)) ?? 0,
        required_compliance_count: requiredComplianceBySeasonId.get(Number(seasonId)) ?? 0,
      });
    }

    return summaryBySeasonId;
  }

  private async seedDefaultSeasonRequirements(seasonId: number, leagueId: number) {
    for (const item of DEFAULT_SEASON_COMPLIANCE_ITEMS) {
      await this.db
        .insertInto('league.team_compliance_items')
        .values({
          league_id: leagueId,
          season_id: seasonId,
          division_id: null,
          key: item.key,
          label: item.label,
          category: item.category,
          is_required: true,
          sort_order: item.sort_order,
          config: item.config as any,
        })
        .execute();
    }

  }

  private async assertLeagueAdminForSeason(seasonId: number, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership) throw new UnauthorizedException('User has no league configured.');
    if (membership.role !== 'league_admin') throw new ForbiddenException('Only league admins can manage season requirements.');

    const season = await this.db
      .selectFrom('league.Season')
      .select(['id', 'league_id'])
      .where('id', '=', seasonId)
      .where('league_id', '=', membership.league_id)
      .executeTakeFirst();
    if (!season) throw new NotFoundException('Season not found or does not belong to your league.');

    return { membership };
  }

  async listComplianceItems(seasonId: number, userId: string, includeArchived: boolean) {
    const { membership } = await this.assertLeagueAdminForSeason(seasonId, userId);

    let q = this.db
      .selectFrom('league.team_compliance_items')
      .selectAll()
      .where('league_id', '=', membership.league_id)
      .where('season_id', '=', seasonId);

    if (!includeArchived) q = q.where('archived_at', 'is', null);

    return q.orderBy('category', 'asc').orderBy('sort_order', 'asc').orderBy('label', 'asc').execute();
  }

  async createComplianceItem(seasonId: number, dto: CreateComplianceItemDto, userId: string) {
    const { membership } = await this.assertLeagueAdminForSeason(seasonId, userId);

    const row = await this.db
      .insertInto('league.team_compliance_items')
      .values({
        league_id: membership.league_id,
        season_id: seasonId,
        division_id: dto.division_id ?? null,
        key: dto.key,
        label: dto.label,
        category: dto.category,
        is_required: dto.is_required ?? true,
        sort_order: dto.sort_order ?? 0,
        config: (dto.config ?? {}) as any,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return { success: true, item: row };
  }

  async updateComplianceItem(seasonId: number, itemId: number, dto: UpdateComplianceItemDto, userId: string) {
    const { membership } = await this.assertLeagueAdminForSeason(seasonId, userId);

    const existing = await this.db
      .selectFrom('league.team_compliance_items')
      .select(['id'])
      .where('id', '=', itemId as any)
      .where('league_id', '=', membership.league_id)
      .where('season_id', '=', seasonId)
      .executeTakeFirst();
    if (!existing) throw new NotFoundException('Compliance item not found.');

    const updated = await this.db
      .updateTable('league.team_compliance_items')
      .set({
        division_id: dto.division_id as any,
        key: dto.key as any,
        label: dto.label as any,
        category: dto.category as any,
        is_required: dto.is_required as any,
        sort_order: dto.sort_order as any,
        config: (dto.config ?? undefined) as any,
      })
      .where('id', '=', itemId as any)
      .where('league_id', '=', membership.league_id)
      .where('season_id', '=', seasonId)
      .returningAll()
      .executeTakeFirstOrThrow();

    return { success: true, item: updated };
  }

  async archiveComplianceItem(seasonId: number, itemId: number, userId: string) {
    const { membership } = await this.assertLeagueAdminForSeason(seasonId, userId);
    await this.db
      .updateTable('league.team_compliance_items')
      .set({ archived_at: new Date() as any })
      .where('id', '=', itemId as any)
      .where('league_id', '=', membership.league_id)
      .where('season_id', '=', seasonId)
      .execute();
    return { success: true };
  }

  async deleteComplianceItem(seasonId: number, itemId: number, userId: string) {
    const { membership } = await this.assertLeagueAdminForSeason(seasonId, userId);
    await this.db
      .deleteFrom('league.team_compliance_items')
      .where('id', '=', itemId as any)
      .where('league_id', '=', membership.league_id)
      .where('season_id', '=', seasonId)
      .execute();
    return { success: true };
  }

}
