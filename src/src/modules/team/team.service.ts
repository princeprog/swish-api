import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { DB } from 'src/database/db';
import { CreateTeamDto } from './dto/create-team.dto';
import { CreateRosterPlayerDto } from './dto/create-roster-player.dto';
import { getUserLeagueMembership } from '../league/league-membership';
import { GameService } from '../game/game.service';
import { computeSeasonTeamEligibility } from './team-eligibility';
import { UpsertComplianceStatusDto } from './dto/upsert-compliance-status.dto';

@Injectable()
export class TeamService {
  constructor(
    @Inject('KYSELY_DB') private readonly db: Kysely<DB>,
    private readonly gameService: GameService,
  ) {}

  async create(createTeamDto: CreateTeamDto, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);

    if (!membership) {
      throw new UnauthorizedException('User has no league configured.');
    }

    const team = await this.db
      .insertInto('league.Teams')
      .values({
        league_id: membership.league_id,
        name: createTeamDto.name,
        abbreviation: createTeamDto.abbreviation,
        coach_name: createTeamDto.coach_name,
        primary_color: createTeamDto.primary_color,
        secondary_color: createTeamDto.secondary_color,
        logo_url: '',
        user_id: userId as any,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      success: true,
      team,
    };
  }

  async findAll(userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);

    if (!membership) {
      return [];
    }

    // Team managers can view all teams in their league, but can only mutate their own team(s).
    return this.db
      .selectFrom('league.Teams')
      .selectAll()
      .where('league_id', '=', membership.league_id)
      .orderBy('name', 'asc')
      .execute();
  }

  async getRoster(teamId: number, seasonId: number, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership) throw new UnauthorizedException('User has no league configured.');

    const team = await this.db
      .selectFrom('league.Teams')
      .select(['id', 'league_id', 'user_id'])
      .where('id', '=', teamId)
      .executeTakeFirst();

    if (!team || Number(team.league_id) !== Number(membership.league_id)) {
      throw new NotFoundException('Team not found in your league.');
    }

    return this.db
      .selectFrom('player.Roster as r')
      .innerJoin('player.Player as p', 'p.id', 'r.player_id')
      .select([
        'r.id as roster_id',
        'r.jersey_number',
        'r.joined_date',
        'r.status',
        'p.id as player_id',
        'p.full_name',
        'p.height_cm',
        'p.weight_kg',
        'p.position',
        'p.photo_url',
      ])
      .where('r.team_id', '=', teamId)
      .where('r.season_id', '=', seasonId)
      .orderBy('p.full_name', 'asc')
      .execute();
  }

  async addRosterPlayer(teamId: number, dto: CreateRosterPlayerDto, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership) throw new UnauthorizedException('User has no league configured.');

    const team = await this.db
      .selectFrom('league.Teams')
      .select(['id', 'league_id', 'user_id'])
      .where('id', '=', teamId)
      .executeTakeFirst();

    if (!team || Number(team.league_id) !== Number(membership.league_id)) {
      throw new NotFoundException('Team not found in your league.');
    }

    if (membership.role === 'team_manager') {
      const assigned = await this.db
        .selectFrom('league.team_manager_teams')
        .select(['team_id'])
        .where('league_id', '=', membership.league_id)
        .where('user_id', '=', userId as any)
        .where('team_id', '=', teamId)
        .executeTakeFirst();

      if (!assigned && team.user_id !== userId) {
        throw new ForbiddenException('Team managers can only manage their assigned teams.');
      }
    }

    const season = await this.db
      .selectFrom('league.Season')
      .select(['id', 'status'])
      .where('id', '=', dto.season_id)
      .executeTakeFirst();

    if (!season) {
      throw new NotFoundException('Season not found.');
    }

    if (Number(season.status) === 3) {
      throw new BadRequestException('Cannot modify roster for an archived season.');
    }

    // 1. Insert Player Profile
    const player = await this.db
      .insertInto('player.Player')
      .values({
        full_name: dto.full_name,
        position: dto.position,
        height_cm: dto.height_cm,
        weight_kg: dto.weight_kg,
        date_of_birth: new Date() as any,
        photo_url: '',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // 2. Bind Player to Team and Season in Roster joint table
    const roster = await this.db
      .insertInto('player.Roster')
      .values({
        team_id: teamId,
        player_id: player.id,
        season_id: dto.season_id,
        jersey_number: dto.jersey_number,
        joined_date: new Date() as any,
        status: 'Active',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      success: true,
      player,
      roster,
    };
  }

  async getSeasonTeamReadiness(seasonId: number, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership) throw new UnauthorizedException('User has no league configured.');

    const season = await this.db
      .selectFrom('league.Season')
      .select(['id'])
      .where('id', '=', seasonId)
      .where('league_id', '=', membership.league_id)
      .executeTakeFirst();
    if (!season) throw new NotFoundException('Season not found or does not belong to your league.');

    let seasonTeamsQuery = this.db
      .selectFrom('league.SeasonTeam as st')
      .innerJoin('league.Teams as t', 't.id', 'st.team_id')
      .select(['t.id', 't.name', 't.abbreviation'])
      .where('st.season_id', '=', seasonId)
      .orderBy('t.name', 'asc')

    const seasonTeams = await seasonTeamsQuery.execute();

    const minRequired = await this.getLeagueMinRequiredPlayers(membership.league_id);
    const seasonMeta = await this.db
      .selectFrom('league.Season')
      .select(['start_date'])
      .where('id', '=', seasonId)
      .executeTakeFirstOrThrow();
    const cutoffDate = new Date(seasonMeta.start_date as any);

    const ageOnDate = (dob: Date, on: Date) => {
      let age = on.getUTCFullYear() - dob.getUTCFullYear();
      const m = on.getUTCMonth() - dob.getUTCMonth();
      if (m < 0 || (m === 0 && on.getUTCDate() < dob.getUTCDate())) age -= 1;
      return age;
    };
    const readiness: Array<{
      team_id: number;
      team_name: string;
      abbreviation: string;
      active_roster_count: number;
      eligible_active_roster_count: number;
      min_required: number;
      is_complete: boolean;
      is_finalized: boolean;
      is_ready: boolean;
      reasons: string[];
      ineligible_player_ids: number[];
      finalized_by_user_id: string | null;
      finalized_at: Date | null;
    }> = [];
    for (const team of seasonTeams) {
      const countRow = await this.db
        .selectFrom('player.Roster')
        .select((eb) => eb.fn.count('id').as('count'))
        .where('season_id', '=', seasonId)
        .where('team_id', '=', team.id)
        .where('status', '=', 'Active')
        .executeTakeFirstOrThrow();
      const active = Number((countRow as any).count ?? 0);

      const division = await this.db
        .selectFrom('league.SeasonTeam as st')
        .innerJoin('league.SeasonDivision as d', 'd.id', 'st.division_id')
        .select(['d.is_open', 'd.age_min', 'd.age_max'])
        .where('st.season_id', '=', seasonId)
        .where('st.team_id', '=', team.id)
        .executeTakeFirst();

      const rosterPlayers = await this.db
        .selectFrom('player.Roster as r')
        .innerJoin('player.Player as p', 'p.id', 'r.player_id')
        .select(['p.id as player_id', 'p.date_of_birth'])
        .where('r.season_id', '=', seasonId)
        .where('r.team_id', '=', team.id)
        .where('r.status', '=', 'Active')
        .execute();

      const ineligible: number[] = [];
      let eligible = 0;
      for (const rp of rosterPlayers as any) {
        if (!division || division.is_open) {
          eligible += 1;
          continue;
        }
        const dob = new Date(rp.date_of_birth as any);
        const age = ageOnDate(dob, cutoffDate);
        if (division.age_min !== null && division.age_min !== undefined && age < Number(division.age_min)) {
          ineligible.push(Number(rp.player_id));
          continue;
        }
        if (division.age_max !== null && division.age_max !== undefined && age > Number(division.age_max)) {
          ineligible.push(Number(rp.player_id));
          continue;
        }
        eligible += 1;
      }
      const seasonTeamMeta = await this.db
        .selectFrom('league.SeasonTeam')
        .select(['is_finalized', 'finalized_by_user_id', 'finalized_at'])
        .where('season_id', '=', seasonId)
        .where('team_id', '=', team.id)
        .executeTakeFirstOrThrow();
      const isComplete = eligible >= minRequired;
      const isFinalized = Boolean(seasonTeamMeta.is_finalized);
      const reasons: string[] = [];
      if (!isComplete) reasons.push('insufficient_eligible_players');
      if (ineligible.length > 0) reasons.push('has_ineligible_players');
      if (!isFinalized) reasons.push('not_finalized');
      readiness.push({
        team_id: team.id,
        team_name: team.name,
        abbreviation: team.abbreviation,
        active_roster_count: active,
        eligible_active_roster_count: eligible,
        min_required: minRequired,
        is_complete: isComplete,
        is_finalized: isFinalized,
        is_ready: isComplete && isFinalized,
        reasons,
        ineligible_player_ids: ineligible,
        finalized_by_user_id: seasonTeamMeta.finalized_by_user_id,
        finalized_at: seasonTeamMeta.finalized_at as any,
      });
    }

    return {
      season_id: seasonId,
      total_teams: readiness.length,
      ready_teams: readiness.filter((r) => r.is_ready).length,
      not_ready_teams: readiness.filter((r) => !r.is_ready).length,
      teams: readiness,
    };
  }

  async getSeasonTeamEligibility(seasonId: number, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership) throw new UnauthorizedException('User has no league configured.');

    const season = await this.db
      .selectFrom('league.Season')
      .select(['id'])
      .where('id', '=', seasonId)
      .where('league_id', '=', membership.league_id)
      .executeTakeFirst();
    if (!season) throw new NotFoundException('Season not found or does not belong to your league.');

    return {
      season_id: seasonId,
      teams: await computeSeasonTeamEligibility(this.db, membership.league_id, seasonId),
    };
  }

  async finalizeRoster(teamId: number, seasonId: number, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership) throw new UnauthorizedException('User has no league configured.');
    const team = await this.db
      .selectFrom('league.Teams')
      .select(['id', 'league_id', 'user_id'])
      .where('id', '=', teamId)
      .executeTakeFirst();
    if (!team || team.league_id !== membership.league_id) throw new NotFoundException('Team not found in your league.');

    if (membership.role === 'team_manager') {
      const assigned = await this.db
        .selectFrom('league.team_manager_teams')
        .select(['team_id'])
        .where('league_id', '=', membership.league_id)
        .where('user_id', '=', userId as any)
        .where('team_id', '=', teamId)
        .executeTakeFirst();

      if (!assigned && team.user_id !== userId) {
        throw new ForbiddenException('Team managers can only finalize their assigned teams.');
      }
    }

    const readiness = await this.getSeasonTeamReadiness(seasonId, userId);
    const row = readiness.teams.find((t) => t.team_id === teamId);
    if (!row) throw new NotFoundException('Team is not assigned to selected season.');
    if (!row.is_complete) throw new BadRequestException('Roster is incomplete. Add required active players before finalizing.');

    await this.db
      .updateTable('league.SeasonTeam')
      .set({
        is_finalized: true as any,
        finalized_by_user_id: userId,
        finalized_at: new Date() as any,
        min_required_players_snapshot: row.min_required,
      })
      .where('season_id', '=', seasonId)
      .where('team_id', '=', teamId)
      .execute();
    return { success: true };
  }

  async reopenRoster(teamId: number, seasonId: number, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership) throw new UnauthorizedException('User has no league configured.');
    const team = await this.db
      .selectFrom('league.Teams')
      .select(['id', 'league_id', 'user_id'])
      .where('id', '=', teamId)
      .executeTakeFirst();
    if (!team || team.league_id !== membership.league_id) throw new NotFoundException('Team not found in your league.');

    if (membership.role === 'team_manager') {
      const assigned = await this.db
        .selectFrom('league.team_manager_teams')
        .select(['team_id'])
        .where('league_id', '=', membership.league_id)
        .where('user_id', '=', userId as any)
        .where('team_id', '=', teamId)
        .executeTakeFirst();

      if (!assigned && team.user_id !== userId) {
        throw new ForbiddenException('Team managers can only reopen their assigned teams.');
      }
    }

    await this.db
      .updateTable('league.SeasonTeam')
      .set({
        is_finalized: false as any,
        finalized_by_user_id: null as any,
        finalized_at: null as any,
      })
      .where('season_id', '=', seasonId)
      .where('team_id', '=', teamId)
      .execute();
    return { success: true };
  }

  private async assertCanManageTeam(teamId: number, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership) throw new UnauthorizedException('User has no league configured.');

    const team = await this.db
      .selectFrom('league.Teams')
      .select(['id', 'league_id', 'user_id'])
      .where('id', '=', teamId)
      .executeTakeFirst();

    if (!team || Number(team.league_id) !== Number(membership.league_id)) {
      throw new NotFoundException('Team not found in your league.');
    }

    if (membership.role === 'team_manager') {
      const assigned = await this.db
        .selectFrom('league.team_manager_teams')
        .select(['team_id'])
        .where('league_id', '=', membership.league_id)
        .where('user_id', '=', userId as any)
        .where('team_id', '=', teamId)
        .executeTakeFirst();

      if (!assigned && team.user_id !== userId) {
        throw new ForbiddenException('Team managers can only manage their assigned teams.');
      }
    }

    return { membership, team };
  }

  async listTeamStaff(teamId: number, seasonId: number, userId: string) {
    const { membership } = await this.assertCanManageTeam(teamId, userId);

    // Allow any league member to view staff for teams in their league.
    const season = await this.db
      .selectFrom('league.Season')
      .select(['id'])
      .where('id', '=', seasonId)
      .where('league_id', '=', membership.league_id)
      .executeTakeFirst();
    if (!season) throw new NotFoundException('Season not found.');

    return this.db
      .selectFrom('league.team_staff')
      .selectAll()
      .where('league_id', '=', membership.league_id)
      .where('season_id', '=', seasonId)
      .where('team_id', '=', teamId)
      .orderBy('role', 'asc')
      .orderBy('full_name', 'asc')
      .execute();
  }

  async listTeamCompliance(teamId: number, seasonId: number, userId: string) {
    const { membership } = await this.assertCanManageTeam(teamId, userId);

    const seasonTeam = await this.db
      .selectFrom('league.SeasonTeam')
      .select(['division_id'])
      .where('season_id', '=', seasonId)
      .where('team_id', '=', teamId)
      .executeTakeFirst();
    if (!seasonTeam) throw new NotFoundException('Team is not assigned to selected season.');
    const divisionId = seasonTeam.division_id === null ? null : Number(seasonTeam.division_id);

    const items = await this.db
      .selectFrom('league.team_compliance_items')
      .select(['id', 'key', 'label', 'category', 'is_required', 'sort_order', 'division_id', 'config', 'archived_at'])
      .where('league_id', '=', membership.league_id)
      .where('season_id', '=', seasonId)
      .where('archived_at', 'is', null)
      .where('is_required', '=', true)
      .where((eb) =>
        eb.or([eb('division_id', 'is', null), eb('division_id', '=', divisionId as any)]),
      )
      .orderBy('category', 'asc')
      .orderBy('sort_order', 'asc')
      .orderBy('label', 'asc')
      .execute();

    const statuses = await this.db
      .selectFrom('league.team_compliance_status')
      .select(['item_id', 'status', 'notes', 'attachments', 'meta', 'updated_at', 'updated_by_user_id'])
      .where('league_id', '=', membership.league_id)
      .where('season_id', '=', seasonId)
      .where('team_id', '=', teamId)
      .execute();
    const byItem = new Map<number, any>(statuses.map((s: any) => [Number(s.item_id), s]));

    return items.map((it: any) => {
      const st = byItem.get(Number(it.id));
      return {
        ...it,
        status: st?.status ?? 'pending',
        notes: st?.notes ?? null,
        attachments: st?.attachments ?? [],
        meta: st?.meta ?? {},
        updated_at: st?.updated_at ?? null,
        updated_by_user_id: st?.updated_by_user_id ?? null,
      };
    });
  }

  async upsertTeamComplianceStatus(teamId: number, seasonId: number, dto: UpsertComplianceStatusDto, userId: string) {
    const { membership } = await this.assertCanManageTeam(teamId, userId);

    const item = await this.db
      .selectFrom('league.team_compliance_items')
      .select(['id', 'league_id', 'season_id', 'division_id', 'archived_at', 'is_required'])
      .where('id', '=', dto.item_id as any)
      .where('league_id', '=', membership.league_id)
      .where('season_id', '=', seasonId)
      .executeTakeFirst();
    if (!item || item.archived_at) throw new NotFoundException('Compliance item not found.');

    // Team managers can only set pending/complete. Waive is admin-only for now.
    if (dto.status !== 'pending' && dto.status !== 'complete') {
      throw new BadRequestException('Invalid compliance status.');
    }

    const existing = await this.db
      .selectFrom('league.team_compliance_status')
      .select(['id'])
      .where('league_id', '=', membership.league_id)
      .where('season_id', '=', seasonId)
      .where('team_id', '=', teamId)
      .where('item_id', '=', dto.item_id as any)
      .executeTakeFirst();

    if (!existing) {
      const inserted = await this.db
        .insertInto('league.team_compliance_status')
        .values({
          league_id: membership.league_id,
          season_id: seasonId,
          team_id: teamId,
          item_id: dto.item_id as any,
          status: dto.status,
          notes: dto.notes ?? null,
          attachments: (dto.attachments ?? []) as any,
          meta: (dto.meta ?? {}) as any,
          updated_by_user_id: userId,
          updated_at: new Date() as any,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return { success: true, status: inserted };
    }

    const updated = await this.db
      .updateTable('league.team_compliance_status')
      .set({
        status: dto.status,
        notes: dto.notes ?? null,
        attachments: (dto.attachments ?? []) as any,
        meta: (dto.meta ?? {}) as any,
        updated_by_user_id: userId,
        updated_at: new Date() as any,
      })
      .where('league_id', '=', membership.league_id)
      .where('season_id', '=', seasonId)
      .where('team_id', '=', teamId)
      .where('item_id', '=', dto.item_id as any)
      .returningAll()
      .executeTakeFirstOrThrow();

    return { success: true, status: updated };
  }

  async addTeamStaff(teamId: number, dto: any, userId: string) {
    const { membership } = await this.assertCanManageTeam(teamId, userId);

    const role = String(dto.role ?? '').trim();
    const full_name = String(dto.full_name ?? '').trim();
    if (!dto.season_id) throw new BadRequestException('season_id is required.');
    if (!role) throw new BadRequestException('role is required.');
    if (!full_name) throw new BadRequestException('full_name is required.');

    const season = await this.db
      .selectFrom('league.Season')
      .select(['id', 'status'])
      .where('id', '=', Number(dto.season_id))
      .where('league_id', '=', membership.league_id)
      .executeTakeFirst();
    if (!season) throw new NotFoundException('Season not found.');
    if (Number(season.status) === 3) throw new BadRequestException('Cannot modify staff for an archived season.');

    const staff = await this.db
      .insertInto('league.team_staff')
      .values({
        league_id: membership.league_id,
        season_id: Number(dto.season_id),
        team_id: teamId,
        role,
        full_name,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        created_by_user_id: userId as any,
      } as any)
      .returningAll()
      .executeTakeFirstOrThrow();

    return { success: true, staff };
  }

  async updateTeamStaff(teamId: number, staffId: number, dto: any, userId: string) {
    const { membership } = await this.assertCanManageTeam(teamId, userId);

    const existing = await this.db
      .selectFrom('league.team_staff')
      .select(['id', 'season_id'])
      .where('id', '=', staffId as any)
      .where('team_id', '=', teamId)
      .where('league_id', '=', membership.league_id)
      .executeTakeFirst();
    if (!existing) throw new NotFoundException('Staff member not found.');

    const patch: any = {};
    if (dto.role !== undefined) patch.role = String(dto.role).trim();
    if (dto.full_name !== undefined) patch.full_name = String(dto.full_name).trim();
    if (dto.email !== undefined) patch.email = dto.email ?? null;
    if (dto.phone !== undefined) patch.phone = dto.phone ?? null;
    patch.updated_at = sql`now()` as any;

    await this.db
      .updateTable('league.team_staff')
      .set(patch)
      .where('id', '=', staffId as any)
      .where('team_id', '=', teamId)
      .where('league_id', '=', membership.league_id)
      .execute();

    return { success: true };
  }

  async removeTeamStaff(teamId: number, staffId: number, userId: string) {
    const { membership } = await this.assertCanManageTeam(teamId, userId);

    await this.db
      .deleteFrom('league.team_staff')
      .where('id', '=', staffId as any)
      .where('team_id', '=', teamId)
      .where('league_id', '=', membership.league_id)
      .execute();

    return { success: true };
  }

  private async getLeagueMinRequiredPlayers(leagueId: number) {
    const league = await this.db
      .selectFrom('league.League')
      .select(['rules_config'])
      .where('id', '=', leagueId)
      .executeTakeFirst();
    const raw = (league?.rules_config as any) ?? {};
    const parsed = Number(raw?.min_roster_players ?? 5);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 5;
  }

  async getSeasonTeamStats(seasonId: number, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership) throw new UnauthorizedException('User has no league configured.');
    const teams = await this.db.selectFrom('league.Teams').select(['id', 'name', 'abbreviation']).where('league_id', '=', membership.league_id).execute();
    const games = await this.db
      .selectFrom('game.Game as g')
      .innerJoin('league.Season as s', 's.id', 'g.season_id')
      .select(['g.id', 'g.home_team', 'g.away_team', 'g.home_score', 'g.away_score', 'g.status'])
      .where('g.season_id', '=', seasonId)
      .where('s.league_id', '=', membership.league_id)
      .where('g.status', '=', 2 as any)
      .execute();

    const map = new Map<number, any>();
    for (const t of teams) {
      map.set(t.id, {
        team_id: t.id, name: t.name, abbreviation: t.abbreviation, games: 0, wins: 0, losses: 0,
        points_for: 0, points_against: 0, rebounds: 0, assists: 0, turnovers: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
      });
    }
    for (const g of games) {
      const home = map.get(Number(g.home_team)); const away = map.get(Number(g.away_team));
      home.games += 1; away.games += 1;
      home.points_for += Number(g.home_score); home.points_against += Number(g.away_score);
      away.points_for += Number(g.away_score); away.points_against += Number(g.home_score);
      if (Number(g.home_score) > Number(g.away_score)) { home.wins += 1; away.losses += 1; }
      else { away.wins += 1; home.losses += 1; }
      const playerStats = await this.gameService.getPlayerStats(Number(g.id), userId);
      for (const p of playerStats) {
        const row = map.get(p.team_id);
        if (!row) continue;
        row.rebounds += p.reb; row.assists += p.assists; row.turnovers += p.turnovers;
        row.fgm += p.fgm; row.fga += p.fga; row.tpm += p.tpm; row.tpa += p.tpa; row.ftm += p.ftm; row.fta += p.fta;
      }
    }

    const pct = (m: number, a: number) => (a > 0 ? Number(((m / a) * 100).toFixed(2)) : 0);
    return Array.from(map.values()).map((r) => ({
      ...r,
      ppg: r.games ? Number((r.points_for / r.games).toFixed(2)) : 0,
      opp_ppg: r.games ? Number((r.points_against / r.games).toFixed(2)) : 0,
      rpg: r.games ? Number((r.rebounds / r.games).toFixed(2)) : 0,
      apg: r.games ? Number((r.assists / r.games).toFixed(2)) : 0,
      topg: r.games ? Number((r.turnovers / r.games).toFixed(2)) : 0,
      fg_pct: pct(r.fgm, r.fga),
      tp_pct: pct(r.tpm, r.tpa),
      ft_pct: pct(r.ftm, r.fta),
    }));
  }

  async getHeadToHead(seasonId: number, teamA: number, teamB: number, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership) throw new UnauthorizedException('User has no league configured.');
    const games = await this.db
      .selectFrom('game.Game as g')
      .innerJoin('league.Season as s', 's.id', 'g.season_id')
      .select(['g.id', 'g.home_team', 'g.away_team', 'g.home_score', 'g.away_score', 'g.scheduled_at'])
      .where('g.season_id', '=', seasonId)
      .where('s.league_id', '=', membership.league_id)
      .where('g.status', '=', 2 as any)
      .where((eb) =>
        eb.or([
          eb.and([eb('g.home_team', '=', teamA), eb('g.away_team', '=', teamB)]),
          eb.and([eb('g.home_team', '=', teamB), eb('g.away_team', '=', teamA)]),
        ]),
      )
      .orderBy('g.scheduled_at', 'asc')
      .execute();
    let teamA_wins = 0;
    let teamB_wins = 0;
    for (const g of games) {
      const aScore = Number(g.home_team === teamA ? g.home_score : g.away_score);
      const bScore = Number(g.home_team === teamA ? g.away_score : g.home_score);
      if (aScore > bScore) teamA_wins += 1;
      else if (bScore > aScore) teamB_wins += 1;
    }
    return { season_id: seasonId, teamA, teamB, teamA_wins, teamB_wins, games };
  }
}
