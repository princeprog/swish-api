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
