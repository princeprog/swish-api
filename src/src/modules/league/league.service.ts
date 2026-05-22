import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CreateLeagueDto } from './dto/create-league.dto';
import type { Kysely } from 'kysely';
import { DB } from 'src/database/db';
import { getUserLeagueMembership } from './league-membership';
import { UpdateLeagueDto } from './dto/update-league.dto';

@Injectable()
export class LeagueService {
  constructor(@Inject('KYSELY_DB') private readonly db: Kysely<DB>) {}

  async create(createLeagueDto: CreateLeagueDto, userId: string) {
    const rulesConfig = this.normalizeRulesConfig(createLeagueDto.rules_config);

    const league = await this.db.transaction().execute(async (trx) => {
      const createdLeague = await trx
        .insertInto('league.League')
        .values({
          name: createLeagueDto.name,
          logo_url: createLeagueDto.logo_url ?? '',
          description: createLeagueDto.description,
          location: createLeagueDto.location,
          contact_info: createLeagueDto.contact_info,
          rules_config: JSON.stringify(rulesConfig) as any,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await trx.insertInto('league.league_members').values({
        league_id: createdLeague.id,
        user_id: userId as any,
        role: 'league_admin',
      }).execute();

      await trx
        .updateTable('auth.users')
        .set({ active_league_id: createdLeague.id as any })
        .where('id', '=', userId as any)
        .execute();

      return createdLeague;
    });

    return {
      success: true,
      leagueId: league.id,
      league,
    };
  }

  async findAll() {
    return this.db.selectFrom('league.League').selectAll().execute();
  }

  async findOne(id: number) {
    return this.db
      .selectFrom('league.League')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async updateLeagueConfiguration(leagueId: number, userId: string, dto: UpdateLeagueDto) {
    const membership = await getUserLeagueMembership(this.db, userId);

    if (!membership || membership.role !== 'league_admin') {
      throw new ForbiddenException('Only league admins can update league configuration.');
    }

    if (membership.league_id !== leagueId) {
      throw new ForbiddenException('You can only update your own league configuration.');
    }

    const current = await this.findOne(leagueId);
    if (!current) {
      throw new NotFoundException('League not found.');
    }

    const nextRulesConfig = dto.rules_config
      ? this.normalizeRulesConfig(dto.rules_config)
      : (current.rules_config as Record<string, unknown>);

    const updated = await this.db
      .updateTable('league.League')
      .set({
        name: dto.name ?? current.name,
        logo_url: dto.logo_url ?? current.logo_url,
        description: dto.description ?? current.description,
        location: dto.location ?? current.location,
        contact_info: dto.contact_info ?? current.contact_info,
        rules_config: JSON.stringify(nextRulesConfig) as any,
      })
      .where('id', '=', leagueId)
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      success: true,
      leagueId: updated.id,
      league: updated,
    };
  }

  async getMemberRoleSummary(userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);

    if (!membership || membership.role !== 'league_admin') {
      throw new ForbiddenException('Only league admins can view member summaries.');
    }

    const [scorekeeperResult, teamManagerResult] = await Promise.all([
      this.db
        .selectFrom('league.league_members')
        .select(({ fn }) => fn.countAll<number>().as('count'))
        .where('league_id', '=', membership.league_id)
        .where('role', '=', 'scorekeeper')
        .executeTakeFirstOrThrow(),
      this.db
        .selectFrom('league.league_members')
        .select(({ fn }) => fn.countAll<number>().as('count'))
        .where('league_id', '=', membership.league_id)
        .where('role', '=', 'team_manager')
        .executeTakeFirstOrThrow(),
    ]);

    return {
      leagueId: membership.league_id,
      scorekeeperCount: Number(scorekeeperResult.count ?? 0),
      teamManagerCount: Number(teamManagerResult.count ?? 0),
    };
  }

  async listMembers(userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);

    if (!membership || membership.role !== 'league_admin') {
      throw new ForbiddenException('Only league admins can view league members.');
    }

    const members = await this.db
      .selectFrom('league.league_members as lm')
      .innerJoin('auth.users as u', 'u.id', 'lm.user_id')
      .select([
        'lm.user_id as user_id',
        'lm.role as role',
        'u.full_name as full_name',
        'u.email as email',
      ])
      .where('lm.league_id', '=', membership.league_id)
      .orderBy('lm.created_at', 'asc')
      .execute();

    return {
      leagueId: membership.league_id,
      members: members.map((m) => ({
        user_id: m.user_id,
        role: m.role,
        full_name: m.full_name,
        email: m.email,
      })),
    };
  }

  async removeMember(userId: string, memberUserId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);

    if (!membership || membership.role !== 'league_admin') {
      throw new ForbiddenException('Only league admins can remove league members.');
    }

    if (memberUserId === userId) {
      throw new BadRequestException('League admins cannot remove themselves.');
    }

    const targetMembership = await this.db
      .selectFrom('league.league_members')
      .select(['league_id', 'user_id', 'role'])
      .where('league_id', '=', membership.league_id)
      .where('user_id', '=', memberUserId as any)
      .executeTakeFirst();

    if (!targetMembership) {
      throw new NotFoundException('Member not found in your league.');
    }

    await this.db
      .deleteFrom('league.league_members')
      .where('league_id', '=', membership.league_id)
      .where('user_id', '=', memberUserId as any)
      .executeTakeFirst();

    return { success: true };
  }

  async getMyManagedTeams(userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership) {
      return { leagueId: null, teamIds: [] };
    }

    if (membership.role !== 'team_manager') {
      return { leagueId: membership.league_id, teamIds: [] };
    }

    const rows = await this.db
      .selectFrom('league.team_manager_teams')
      .select(['team_id'])
      .where('league_id', '=', membership.league_id)
      .where('user_id', '=', userId as any)
      .orderBy('team_id', 'asc')
      .execute();

    return {
      leagueId: membership.league_id,
      teamIds: rows.map((r) => Number(r.team_id)),
    };
  }

  async getMemberManagedTeams(adminUserId: string, memberUserId: string) {
    const membership = await getUserLeagueMembership(this.db, adminUserId);

    if (!membership || membership.role !== 'league_admin') {
      throw new ForbiddenException('Only league admins can view team manager assignments.');
    }

    const member = await this.db
      .selectFrom('league.league_members')
      .select(['user_id', 'role'])
      .where('league_id', '=', membership.league_id)
      .where('user_id', '=', memberUserId as any)
      .executeTakeFirst();

    if (!member) {
      throw new NotFoundException('Member not found in your league.');
    }

    if (member.role !== 'team_manager') {
      return { leagueId: membership.league_id, memberUserId, teamIds: [] };
    }

    const rows = await this.db
      .selectFrom('league.team_manager_teams')
      .select(['team_id'])
      .where('league_id', '=', membership.league_id)
      .where('user_id', '=', memberUserId as any)
      .orderBy('team_id', 'asc')
      .execute();

    return {
      leagueId: membership.league_id,
      memberUserId,
      teamIds: rows.map((r) => Number(r.team_id)),
    };
  }

  async setMemberManagedTeams(adminUserId: string, memberUserId: string, teamIds: number[]) {
    const membership = await getUserLeagueMembership(this.db, adminUserId);

    if (!membership || membership.role !== 'league_admin') {
      throw new ForbiddenException('Only league admins can manage team assignments.');
    }

    const member = await this.db
      .selectFrom('league.league_members')
      .select(['user_id', 'role'])
      .where('league_id', '=', membership.league_id)
      .where('user_id', '=', memberUserId as any)
      .executeTakeFirst();

    if (!member) {
      throw new NotFoundException('Member not found in your league.');
    }

    if (member.role !== 'team_manager') {
      throw new BadRequestException('Only team managers can be assigned to teams.');
    }

    const uniqueTeamIds = Array.from(
      new Set((teamIds ?? []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)),
    );

    if (uniqueTeamIds.length > 1) {
      throw new BadRequestException('Team managers can only be assigned to one team.');
    }

    const validTeams = uniqueTeamIds.length === 0
      ? []
      : await this.db
          .selectFrom('league.Teams')
          .select(['id'])
          .where('league_id', '=', membership.league_id)
          .where('id', 'in', uniqueTeamIds as any)
          .execute();

    const validTeamIds = new Set(validTeams.map((t) => Number(t.id)));
    const finalTeamIds = uniqueTeamIds.filter((id) => validTeamIds.has(id));

    await this.db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom('league.team_manager_teams')
        .where('league_id', '=', membership.league_id)
        .where('user_id', '=', memberUserId as any)
        .execute();

      if (finalTeamIds.length > 0) {
        await trx
          .insertInto('league.team_manager_teams')
          .values(finalTeamIds.map((teamId) => ({
            league_id: membership.league_id,
            team_id: teamId,
            user_id: memberUserId as any,
          })))
          .execute();
      }
    });

    return {
      success: true,
      leagueId: membership.league_id,
      memberUserId,
      teamIds: finalTeamIds,
    };
  }

  async getSetupDraft(userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership || (membership.role !== 'league_admin' && membership.role !== 'super_admin')) {
      throw new ForbiddenException('Only league admins can access setup draft.');
    }

    const league = await this.db
      .selectFrom('league.League')
      .select(['id', 'rules_config'])
      .where('id', '=', membership.league_id)
      .executeTakeFirst();
    if (!league) throw new NotFoundException('League not found.');

    const rules = (league.rules_config as any) ?? {};
    return { leagueId: league.id, draft: rules.setup_draft ?? null };
  }

  async upsertSetupDraft(userId: string, draft: Record<string, any>) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership || (membership.role !== 'league_admin' && membership.role !== 'super_admin')) {
      throw new ForbiddenException('Only league admins can update setup draft.');
    }

    const league = await this.db
      .selectFrom('league.League')
      .select(['id', 'rules_config'])
      .where('id', '=', membership.league_id)
      .executeTakeFirst();
    if (!league) throw new NotFoundException('League not found.');

    const nextRules = {
      ...((league.rules_config as any) ?? {}),
      setup_draft: draft ?? {},
    };

    await this.db
      .updateTable('league.League')
      .set({ rules_config: JSON.stringify(nextRules) as any })
      .where('id', '=', membership.league_id)
      .execute();

    return { success: true };
  }

  private normalizeRulesConfig(raw: Record<string, any>) {
    if (!raw || typeof raw !== 'object') {
      throw new BadRequestException('rules_config is required.');
    }

    const periodCount = this.parsePositiveInteger(
      raw.period_count ?? raw.quarters_count ?? 4,
      'rules_config.period_count',
    );
    const periodDurationMinutes = this.parsePositiveInteger(
      raw.period_duration_minutes ?? raw.quarter_duration_minutes,
      'rules_config.period_duration_minutes',
    );
    const shotClockSeconds = this.parsePositiveInteger(
      raw.shot_clock_seconds,
      'rules_config.shot_clock_seconds',
    );
    const overtimeDurationMinutes = this.parsePositiveInteger(
      raw.overtime_duration_minutes,
      'rules_config.overtime_duration_minutes',
    );

    return {
      ...raw,
      period_count: periodCount,
      period_duration_minutes: periodDurationMinutes,
      shot_clock_seconds: shotClockSeconds,
      overtime_duration_minutes: overtimeDurationMinutes,
    };
  }

  private parsePositiveInteger(value: unknown, fieldPath: string) {
    const num = Number(value);

    if (!Number.isInteger(num) || num <= 0) {
      throw new BadRequestException(`${fieldPath} must be a positive integer.`);
    }

    return num;
  }
}
