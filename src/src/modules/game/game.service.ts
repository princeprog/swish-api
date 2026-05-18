import { Inject, Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { Kysely } from 'node_modules/kysely/dist/kysely';
import { DB } from 'src/database/db';
import { CreateGameDto } from './dto/create-game.dto';
import { UpdateGameScoreDto } from './dto/update-game-score.dto';
import { getUserLeagueMembership } from '../league/league-membership';

@Injectable()
export class GameService {
  constructor(@Inject('KYSELY_DB') private readonly db: Kysely<DB>) {}

  async create(createGameDto: CreateGameDto, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);

    if (!membership) {
      throw new UnauthorizedException('User has no league configured.');
    }

    // Verify season belongs to the league
    const season = await this.db
      .selectFrom('league.Season')
      .select('id')
      .where('id', '=', createGameDto.season_id)
      .where('league_id', '=', membership.league_id)
      .executeTakeFirst();

    if (!season) {
      throw new NotFoundException('Season not found or does not belong to your league.');
    }

    const game = await this.db
      .insertInto('game.Game')
      .values({
        season_id: createGameDto.season_id,
        home_team: createGameDto.home_team,
        away_team: createGameDto.away_team,
        scheduled_at: createGameDto.scheduled_at as any,
        venue: createGameDto.venue,
        game_type: createGameDto.game_type,
        status: 0 as any, // 0 = Scheduled
        home_score: 0,
        away_score: 0,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      success: true,
      game,
    };
  }

  async findAll(seasonId: number, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);

    if (!membership) {
      return [];
    }

    // Return games joined with home/away team details
    return this.db
      .selectFrom('game.Game as g')
      .innerJoin('league.Teams as home', 'home.id', 'g.home_team')
      .innerJoin('league.Teams as away', 'away.id', 'g.away_team')
      .select([
        'g.id',
        'g.season_id',
        'g.home_team',
        'g.away_team',
        'g.scheduled_at',
        'g.venue',
        'g.game_type',
        'g.status',
        'g.home_score',
        'g.away_score',
        'home.name as home_team_name',
        'home.abbreviation as home_team_abbreviation',
        'home.primary_color as home_team_primary_color',
        'home.secondary_color as home_team_secondary_color',
        'away.name as away_team_name',
        'away.abbreviation as away_team_abbreviation',
        'away.primary_color as away_team_primary_color',
        'away.secondary_color as away_team_secondary_color',
      ])
      .where('g.season_id', '=', seasonId)
      .orderBy('g.scheduled_at', 'asc')
      .execute();
  }

  async updateScore(gameId: number, updateScoreDto: UpdateGameScoreDto, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);

    if (!membership) {
      throw new UnauthorizedException('User has no league configured.');
    }

    // Verify game exists and belongs to the user's league
    const game = await this.db
      .selectFrom('game.Game as g')
      .innerJoin('league.Season as s', 's.id', 'g.season_id')
      .select('g.id')
      .where('g.id', '=', gameId as any)
      .where('s.league_id', '=', membership.league_id)
      .executeTakeFirst();

    if (!game) {
      throw new NotFoundException('Match not found or does not belong to your league.');
    }

    await this.db
      .updateTable('game.Game')
      .set({
        home_score: updateScoreDto.home_score,
        away_score: updateScoreDto.away_score,
        status: updateScoreDto.status as any,
      })
      .where('id', '=', gameId as any)
      .execute();

    return {
      success: true,
    };
  }

  async delete(gameId: number, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);

    if (!membership) {
      throw new UnauthorizedException('User has no league configured.');
    }

    // Verify game exists and belongs to the user's league
    const game = await this.db
      .selectFrom('game.Game as g')
      .innerJoin('league.Season as s', 's.id', 'g.season_id')
      .select('g.id')
      .where('g.id', '=', gameId as any)
      .where('s.league_id', '=', membership.league_id)
      .executeTakeFirst();

    if (!game) {
      throw new NotFoundException('Match not found or does not belong to your league.');
    }

    await this.db
      .deleteFrom('game.Game')
      .where('id', '=', gameId as any)
      .execute();

    return {
      success: true,
    };
  }
}
