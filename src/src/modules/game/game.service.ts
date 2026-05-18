import { BadRequestException, Inject, Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { DB } from 'src/database/db';
import { CreateGameDto } from './dto/create-game.dto';
import { UpdateGameScoreDto } from './dto/update-game-score.dto';
import { getUserLeagueMembership } from '../league/league-membership';
import { GenerateRoundRobinDto } from './dto/generate-round-robin.dto';

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
      .select(['id', 'status'])
      .where('id', '=', createGameDto.season_id)
      .where('league_id', '=', membership.league_id)
      .executeTakeFirst();

    if (!season) {
      throw new NotFoundException('Season not found or does not belong to your league.');
    }
    if (Number(season.status) === 3) {
      throw new BadRequestException('Cannot modify games for an archived season.');
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
      .select(['g.id', 's.status as season_status'])
      .where('g.id', '=', gameId as any)
      .where('s.league_id', '=', membership.league_id)
      .executeTakeFirst();

    if (!game) {
      throw new NotFoundException('Match not found or does not belong to your league.');
    }
    if (Number(game.season_status) === 3) {
      throw new BadRequestException('Cannot modify games for an archived season.');
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
      .select(['g.id', 's.status as season_status'])
      .where('g.id', '=', gameId as any)
      .where('s.league_id', '=', membership.league_id)
      .executeTakeFirst();

    if (!game) {
      throw new NotFoundException('Match not found or does not belong to your league.');
    }
    if (Number(game.season_status) === 3) {
      throw new BadRequestException('Cannot modify games for an archived season.');
    }

    await this.db
      .deleteFrom('game.Game')
      .where('id', '=', gameId as any)
      .execute();

    return {
      success: true,
    };
  }

  async generateRoundRobinSchedule(dto: GenerateRoundRobinDto, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership) {
      throw new UnauthorizedException('User has no league configured.');
    }

    this.validateRoundRobinInput(dto);

    const season = await this.db
      .selectFrom('league.Season')
      .select(['id', 'status'])
      .where('id', '=', dto.season_id)
      .where('league_id', '=', membership.league_id)
      .executeTakeFirst();

    if (!season) {
      throw new NotFoundException('Season not found or does not belong to your league.');
    }
    if (Number(season.status) === 3) {
      throw new BadRequestException('Cannot modify games for an archived season.');
    }

    const teams = await this.db
      .selectFrom('league.Teams')
      .select(['id'])
      .where('league_id', '=', membership.league_id)
      .orderBy('id', 'asc')
      .execute();

    if (teams.length < 2) {
      throw new BadRequestException('At least 2 teams are required to generate a round-robin schedule.');
    }

    const teamIds = teams.map((team) => team.id);
    const pairings = this.buildRoundRobinPairings(teamIds, dto.games_per_team);
    if (pairings.length === 0) {
      throw new BadRequestException('No fixtures generated. Check games_per_team and team count.');
    }

    const existingGames = await this.db
      .selectFrom('game.Game')
      .select(['home_team', 'away_team', 'scheduled_at'])
      .where('season_id', '=', dto.season_id)
      .execute();

    const existingDayIndex = new Set<string>();
    for (const game of existingGames) {
      const day = this.toDayKey(game.scheduled_at as any);
      existingDayIndex.add(`${day}:${game.home_team}`);
      existingDayIndex.add(`${day}:${game.away_team}`);
    }

    const scheduledAtDates = this.assignDatesForPairings(
      pairings,
      dto.start_date,
      dto.game_time,
      dto.frequency_days,
      existingDayIndex,
    );

    const insertedGames = await this.db.transaction().execute(async (trx) => {
      const created: any[] = [];
      for (let idx = 0; idx < pairings.length; idx += 1) {
        const [homeTeam, awayTeam] = pairings[idx];
        const inserted = await trx
          .insertInto('game.Game')
          .values({
            season_id: dto.season_id,
            home_team: homeTeam,
            away_team: awayTeam,
            scheduled_at: scheduledAtDates[idx] as any,
            venue: dto.venue,
            game_type: dto.game_type,
            status: 0 as any,
            home_score: 0,
            away_score: 0,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        created.push(inserted);
      }
      return created;
    });

    return {
      success: true,
      generatedCount: insertedGames.length,
      games: insertedGames,
    };
  }

  private validateRoundRobinInput(dto: GenerateRoundRobinDto) {
    if (!dto.season_id || dto.season_id <= 0) {
      throw new BadRequestException('season_id is required.');
    }
    if (!dto.start_date || Number.isNaN(new Date(dto.start_date).getTime())) {
      throw new BadRequestException('start_date must be a valid date.');
    }
    if (!/^\d{2}:\d{2}$/.test(dto.game_time)) {
      throw new BadRequestException('game_time must be in HH:mm format.');
    }
    if (!dto.venue?.trim()) {
      throw new BadRequestException('venue is required.');
    }
    if (!dto.game_type?.trim()) {
      throw new BadRequestException('game_type is required.');
    }
    if (!Number.isInteger(dto.frequency_days) || dto.frequency_days <= 0) {
      throw new BadRequestException('frequency_days must be a positive integer.');
    }
    if (!Number.isInteger(dto.games_per_team) || dto.games_per_team <= 0) {
      throw new BadRequestException('games_per_team must be a positive integer.');
    }
  }

  private buildRoundRobinPairings(teamIds: number[], gamesPerTeam: number): Array<[number, number]> {
    const ids = [...teamIds];
    const hasBye = ids.length % 2 !== 0;
    if (hasBye) {
      ids.push(-1);
    }
    const rounds = ids.length - 1;
    const matchesPerRound = ids.length / 2;
    const allRounds: Array<Array<[number, number]>> = [];
    let rotated = [...ids];

    for (let round = 0; round < rounds; round += 1) {
      const roundPairings: Array<[number, number]> = [];
      for (let m = 0; m < matchesPerRound; m += 1) {
        const home = rotated[m];
        const away = rotated[rotated.length - 1 - m];
        if (home !== -1 && away !== -1) {
          roundPairings.push(round % 2 === 0 ? [home, away] : [away, home]);
        }
      }
      allRounds.push(roundPairings);
      const fixed = rotated[0];
      const moved = rotated.pop() as number;
      rotated = [fixed, moved, ...rotated.slice(1)];
    }

    const neededGamesTotal = Math.floor((teamIds.length * gamesPerTeam) / 2);
    const flat = allRounds.flat();
    if (neededGamesTotal <= flat.length) {
      return flat.slice(0, neededGamesTotal);
    }

    const extended: Array<[number, number]> = [];
    let loop = 0;
    while (extended.length < neededGamesTotal) {
      for (const [home, away] of flat) {
        if (extended.length >= neededGamesTotal) break;
        extended.push(loop % 2 === 0 ? [home, away] : [away, home]);
      }
      loop += 1;
    }
    return extended;
  }

  private assignDatesForPairings(
    pairings: Array<[number, number]>,
    startDate: string,
    gameTime: string,
    frequencyDays: number,
    existingDayIndex: Set<string>,
  ) {
    const scheduled: Date[] = [];
    let cursor = new Date(startDate);
    let pairIndex = 0;
    while (pairIndex < pairings.length) {
      const [home, away] = pairings[pairIndex];
      const dayKey = this.toDayKey(cursor);
      const homeKey = `${dayKey}:${home}`;
      const awayKey = `${dayKey}:${away}`;
      if (!existingDayIndex.has(homeKey) && !existingDayIndex.has(awayKey)) {
        const [hh, mm] = gameTime.split(':').map(Number);
        const scheduledAt = new Date(cursor);
        scheduledAt.setHours(hh, mm, 0, 0);
        scheduled.push(scheduledAt);
        existingDayIndex.add(homeKey);
        existingDayIndex.add(awayKey);
        pairIndex += 1;
      }
      cursor = new Date(cursor.getTime() + frequencyDays * 24 * 60 * 60 * 1000);
    }
    return scheduled;
  }

  private toDayKey(value: Date | string) {
    const date = value instanceof Date ? value : new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
