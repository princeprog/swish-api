import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { CreateLeagueDto } from './dto/create-league.dto';
import type { Kysely } from 'kysely';
import { DB } from 'src/database/db';
import { getUserLeagueMembership } from './league-membership';

@Injectable()
export class LeagueService {
  constructor(@Inject('KYSELY_DB') private readonly db: Kysely<DB>) {}

  async create(createLeagueDto: CreateLeagueDto, userId: string) {
    const league = await this.db.transaction().execute(async (trx) => {
      const createdLeague = await trx
        .insertInto('league.League')
        .values({
          name: createLeagueDto.name,
          logo_url: createLeagueDto.logo_url ?? '',
          description: createLeagueDto.description,
          location: createLeagueDto.location,
          contact_info: createLeagueDto.contact_info,
          rules_config: JSON.stringify(createLeagueDto.rules_config) as any,
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
}
