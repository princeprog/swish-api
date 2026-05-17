import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Kysely } from 'node_modules/kysely/dist/kysely';
import { DB } from 'src/database/db';
import { CreateTeamDto } from './dto/create-team.dto';
import { CreateRosterPlayerDto } from './dto/create-roster-player.dto';

@Injectable()
export class TeamService {
  constructor(@Inject('KYSELY_DB') private readonly db: Kysely<DB>) {}

  async create(createTeamDto: CreateTeamDto, userId: string) {
    const user = await this.db
      .selectFrom('auth.users')
      .select('league_id')
      .where('id', '=', userId as any)
      .executeTakeFirst();

    if (!user || user.league_id === null) {
      throw new UnauthorizedException('User has no league configured.');
    }

    const team = await this.db
      .insertInto('league.Teams')
      .values({
        league_id: user.league_id,
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
    const user = await this.db
      .selectFrom('auth.users')
      .select('league_id')
      .where('id', '=', userId as any)
      .executeTakeFirst();

    if (!user || user.league_id === null) {
      return [];
    }

    return this.db
      .selectFrom('league.Teams')
      .selectAll()
      .where('league_id', '=', user.league_id)
      .orderBy('name', 'asc')
      .execute();
  }

  async getRoster(teamId: number, seasonId: number) {
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

  async addRosterPlayer(teamId: number, dto: CreateRosterPlayerDto) {
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
}
