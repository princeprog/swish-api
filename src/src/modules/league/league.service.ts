import { Inject, Injectable } from '@nestjs/common';
import { CreateLeagueDto } from './dto/create-league.dto';
import { Kysely } from 'node_modules/kysely/dist/kysely';
import { DB } from 'src/database/db';

@Injectable()
export class LeagueService {
  constructor(@Inject('KYSELY_DB') private readonly db: Kysely<DB>) {}

  async create(createLeagueDto: CreateLeagueDto, userId: string) {
    // 1. Insert the new league
    const league = await this.db
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

    // 2. Associate the league ID with the logged-in user
    await this.db
      .updateTable('auth.users')
      .set({ league_id: league.id })
      .where('id', '=', userId as any)
      .execute();

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
}
