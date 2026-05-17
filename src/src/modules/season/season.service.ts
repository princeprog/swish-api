import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Kysely } from 'node_modules/kysely/dist/kysely';
import { DB } from 'src/database/db';
import { CreateSeasonDto } from './dto/create-season.dto';

@Injectable()
export class SeasonService {
  constructor(@Inject('KYSELY_DB') private readonly db: Kysely<DB>) {}

  async create(createSeasonDto: CreateSeasonDto, userId: string) {
    // 1. Fetch user to find their associated league_id
    const user = await this.db
      .selectFrom('auth.users')
      .select('league_id')
      .where('id', '=', userId as any)
      .executeTakeFirst();

    if (!user || user.league_id === null) {
      throw new UnauthorizedException('User has no league configured yet.');
    }

    // 2. Insert season
    const season = await this.db
      .insertInto('league.Season')
      .values({
        league_id: user.league_id,
        name: createSeasonDto.name,
        start_date: createSeasonDto.start_date as any,
        end_date: createSeasonDto.end_date as any,
        playoff_format: createSeasonDto.playoff_format,
        status: 1 as any, // 1 = Active / Draft
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      success: true,
      season,
    };
  }

  async findForLeague(userId: string) {
    // Fetch user to find their associated league_id
    const user = await this.db
      .selectFrom('auth.users')
      .select('league_id')
      .where('id', '=', userId as any)
      .executeTakeFirst();

    if (!user || user.league_id === null) {
      return [];
    }

    return this.db
      .selectFrom('league.Season')
      .selectAll()
      .where('league_id', '=', user.league_id)
      .orderBy('start_date', 'desc')
      .execute();
  }

  async findOne(id: number, userId: string) {
    // Fetch user to find their associated league_id
    const user = await this.db
      .selectFrom('auth.users')
      .select('league_id')
      .where('id', '=', userId as any)
      .executeTakeFirst();

    if (!user || user.league_id === null) {
      throw new UnauthorizedException('User has no league configured.');
    }

    return this.db
      .selectFrom('league.Season')
      .selectAll()
      .where('id', '=', id)
      .where('league_id', '=', user.league_id)
      .executeTakeFirst();
  }
}
