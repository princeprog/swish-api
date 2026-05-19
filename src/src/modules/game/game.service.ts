import { BadRequestException, Inject, Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { DB } from 'src/database/db';
import { CreateGameDto } from './dto/create-game.dto';
import { UpdateGameScoreDto } from './dto/update-game-score.dto';
import { getUserLeagueMembership } from '../league/league-membership';
import { GenerateRoundRobinDto } from './dto/generate-round-robin.dto';
import { UpdateGameStatusDto } from './dto/update-game-status.dto';
import { InitializeGameDto } from './dto/initialize-game.dto';
import { AddScoringEventDto } from './dto/add-scoring-event.dto';
import { RemoveScoringEventDto } from './dto/remove-scoring-event.dto';
import { AddPlayerStatEventDto } from './dto/add-player-stat-event.dto';
import { LogSubstitutionDto } from './dto/log-substitution.dto';
import { ClockActionDto } from './dto/clock-action.dto';
import { FinalizeGameDto } from './dto/finalize-game.dto';
import { PublishGameSummaryDto } from './dto/publish-game-summary.dto';
import { SetGameAwardsDto } from './dto/set-game-awards.dto';

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
    await this.ensureScheduleReadiness(createGameDto.season_id, membership.league_id);

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
      .select(['g.id', 'g.status', 's.status as season_status'])
      .where('g.id', '=', gameId as any)
      .where('s.league_id', '=', membership.league_id)
      .executeTakeFirst();

    if (!game) {
      throw new NotFoundException('Match not found or does not belong to your league.');
    }
    if (Number(game.season_status) === 3) {
      throw new BadRequestException('Cannot modify games for an archived season.');
    }

    this.validateGameStatusTransition(Number((game as any).status ?? 0), updateScoreDto.status);

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

  async updateStatus(gameId: number, dto: UpdateGameStatusDto, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership) {
      throw new UnauthorizedException('User has no league configured.');
    }

    const game = await this.db
      .selectFrom('game.Game as g')
      .innerJoin('league.Season as s', 's.id', 'g.season_id')
      .select(['g.id', 'g.status', 's.status as season_status'])
      .where('g.id', '=', gameId as any)
      .where('s.league_id', '=', membership.league_id)
      .executeTakeFirst();

    if (!game) {
      throw new NotFoundException('Match not found or does not belong to your league.');
    }
    if (Number(game.season_status) === 3) {
      throw new BadRequestException('Cannot modify games for an archived season.');
    }

    this.validateGameStatusTransition(Number(game.status), Number(dto.status));

    await this.db
      .updateTable('game.Game')
      .set({ status: dto.status as any })
      .where('id', '=', gameId as any)
      .execute();

    return { success: true };
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
    await this.ensureScheduleReadiness(dto.season_id, membership.league_id);

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

  async getScheduleReadiness(seasonId: number, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership) throw new UnauthorizedException('User has no league configured.');
    return this.computeScheduleReadiness(seasonId, membership.league_id);
  }

  async initializeGame(gameId: number, dto: InitializeGameDto, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership) throw new UnauthorizedException('User has no league configured.');

    const game = await this.db
      .selectFrom('game.Game as g')
      .innerJoin('league.Season as s', 's.id', 'g.season_id')
      .select(['g.id', 'g.season_id', 'g.home_team', 'g.away_team', 'g.status', 's.status as season_status'])
      .where('g.id', '=', gameId as any)
      .where('s.league_id', '=', membership.league_id)
      .executeTakeFirst();
    if (!game) throw new NotFoundException('Match not found or does not belong to your league.');
    if (Number(game.season_status) === 3) throw new BadRequestException('Cannot modify games for an archived season.');
    if (Number(game.status) !== 0) throw new BadRequestException('Only scheduled games can be initialized.');

    this.validateInitializationInput(dto);
    this.validateStartersAndDnp(dto);

    const homeRoster = await this.db
      .selectFrom('player.Roster')
      .select(['player_id'])
      .where('team_id', '=', Number(game.home_team))
      .where('season_id', '=', Number(game.season_id))
      .execute();
    const awayRoster = await this.db
      .selectFrom('player.Roster')
      .select(['player_id'])
      .where('team_id', '=', Number(game.away_team))
      .where('season_id', '=', Number(game.season_id))
      .execute();
    const homeSet = new Set(homeRoster.map((r) => Number(r.player_id)));
    const awaySet = new Set(awayRoster.map((r) => Number(r.player_id)));
    for (const id of dto.home_starter_player_ids) if (!homeSet.has(id)) throw new BadRequestException(`Home starter ${id} is not in roster.`);
    for (const id of dto.away_starter_player_ids) if (!awaySet.has(id)) throw new BadRequestException(`Away starter ${id} is not in roster.`);
    for (const id of dto.home_dnp_player_ids ?? []) if (!homeSet.has(id)) throw new BadRequestException(`Home DNP ${id} is not in roster.`);
    for (const id of dto.away_dnp_player_ids ?? []) if (!awaySet.has(id)) throw new BadRequestException(`Away DNP ${id} is not in roster.`);

    await this.db.transaction().execute(async (trx) => {
      const markDnp = async (teamId: number, dnpIds: number[] | undefined) => {
        for (const playerId of dnpIds ?? []) {
          await trx
            .updateTable('player.Roster')
            .set({ status: 'DNP' })
            .where('season_id', '=', Number(game.season_id))
            .where('team_id', '=', teamId)
            .where('player_id', '=', playerId as any)
            .execute();
        }
      };
      await markDnp(Number(game.home_team), dto.home_dnp_player_ids);
      await markDnp(Number(game.away_team), dto.away_dnp_player_ids);

      const createStatRows = async (teamId: number, starterIds: number[]) => {
        for (const playerId of starterIds) {
          await trx
            .insertInto('game.GameStats')
            .values({
              game_id: gameId as any,
              player_id: playerId as any,
              team_id: teamId,
              points: 0,
              rebounds: 0,
              assists: 0,
              steal: 0,
              blocks: 0,
              personal_fouls: 0,
              minutes_played: 0,
              fgm_fga: '0/0',
              tpm_tpa: '0/0',
              ftm_fta: '0/0',
            })
            .execute();
        }
      };
      await createStatRows(Number(game.home_team), dto.home_starter_player_ids);
      await createStatRows(Number(game.away_team), dto.away_starter_player_ids);

      await trx
        .insertInto('game.GameEvent')
        .values({
          game_id: gameId as any,
          team_id: Number(game.home_team),
          player_id: dto.home_starter_player_ids[0] as any,
          event_type: 'GAME_INITIALIZED',
          event_value: 0,
          period: dto.initial_period,
          clock_time: dto.initial_clock_time,
        })
        .execute();

      await trx.updateTable('game.Game').set({ status: 1 as any }).where('id', '=', gameId as any).execute();
    });

    return { success: true };
  }

  async addScoringEvent(gameId: number, dto: AddScoringEventDto, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership) throw new UnauthorizedException('User has no league configured.');
    const game = await this.getLeagueGame(gameId, membership.league_id);
    if (Number(game.status) !== 1) throw new BadRequestException('Scoring events can only be added for live games.');
    if (!['FT', '2PT', '3PT'].includes(dto.shot_type)) throw new BadRequestException('Invalid shot_type.');
    if (!/^\d{2}:\d{2}$/.test(dto.clock_time)) throw new BadRequestException('clock_time must be in HH:mm format.');
    const points = dto.shot_type === 'FT' ? 1 : dto.shot_type === '2PT' ? 2 : 3;

    const event = await this.db.transaction().execute(async (trx) => {
      const inserted = await trx
        .insertInto('game.GameEvent')
        .values({
          game_id: gameId as any,
          team_id: dto.team_id,
          player_id: dto.player_id as any,
          period: dto.period,
          clock_time: dto.clock_time,
          event_type: `SCORE_${dto.shot_type}`,
          event_value: points,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      if (dto.team_id === Number(game.home_team)) {
        await trx
          .updateTable('game.Game')
          .set({ home_score: sql<number>`home_score + ${points}` as any })
          .where('id', '=', gameId as any)
          .execute();
      } else if (dto.team_id === Number(game.away_team)) {
        await trx
          .updateTable('game.Game')
          .set({ away_score: sql<number>`away_score + ${points}` as any })
          .where('id', '=', gameId as any)
          .execute();
      } else {
        throw new BadRequestException('team_id must match home or away team.');
      }
      return inserted;
    });
    return { success: true, event };
  }

  async listScoringEvents(gameId: number, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership) throw new UnauthorizedException('User has no league configured.');
    await this.getLeagueGame(gameId, membership.league_id);
    return this.db
      .selectFrom('game.GameEvent')
      .selectAll()
      .where('game_id', '=', gameId as any)
      .where('event_type', 'not like', 'AUDIT_%')
      .orderBy('id', 'desc')
      .execute();
  }

  async removeScoringEvent(gameId: number, eventId: number, dto: RemoveScoringEventDto, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership) throw new UnauthorizedException('User has no league configured.');
    const game = await this.getLeagueGame(gameId, membership.league_id);
    if (Number(game.status) !== 1) throw new BadRequestException('Scoring events can only be removed during live games.');

    const event = await this.db
      .selectFrom('game.GameEvent')
      .selectAll()
      .where('id', '=', eventId as any)
      .where('game_id', '=', gameId as any)
      .executeTakeFirst();
    if (!event) throw new NotFoundException('Scoring event not found.');
    if ((event.event_type ?? '').startsWith('AUDIT_')) throw new BadRequestException('Cannot remove an audit event.');

    await this.db.transaction().execute(async (trx) => {
      if (Number(event.team_id) === Number(game.home_team)) {
        await trx
          .updateTable('game.Game')
          .set({ home_score: sql<number>`home_score - ${Number(event.event_value)}` as any })
          .where('id', '=', gameId as any)
          .execute();
      } else if (Number(event.team_id) === Number(game.away_team)) {
        await trx
          .updateTable('game.Game')
          .set({ away_score: sql<number>`away_score - ${Number(event.event_value)}` as any })
          .where('id', '=', gameId as any)
          .execute();
      }

      await trx
        .insertInto('game.GameEvent')
        .values({
          game_id: gameId as any,
          team_id: event.team_id,
          player_id: event.player_id,
          period: event.period,
          clock_time: event.clock_time,
          event_type: `AUDIT_REMOVE_${event.id}`,
          event_value: -Number(event.event_value),
        })
        .execute();

      await trx.deleteFrom('game.GameEvent').where('id', '=', eventId as any).execute();
    });

    return { success: true };
  }

  async addPlayerStatEvent(gameId: number, dto: AddPlayerStatEventDto, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership) throw new UnauthorizedException('User has no league configured.');
    const game = await this.getLeagueGame(gameId, membership.league_id);
    if (Number(game.status) !== 1) throw new BadRequestException('Player stat events can only be added for live games.');
    if (!/^\d{2}:\d{2}$/.test(dto.clock_time)) throw new BadRequestException('clock_time must be in HH:mm format.');
    const allowed = ['OREB', 'DREB', 'AST', 'TOV', 'STL', 'BLK', 'PF', 'MIN', 'MISS_FT', 'MISS_2PT', 'MISS_3PT'];
    if (!allowed.includes(dto.stat_type)) throw new BadRequestException('Invalid stat_type.');

    const eventValue = Number(dto.value ?? 1);
    const event = await this.db
      .insertInto('game.GameEvent')
      .values({
        game_id: gameId as any,
        team_id: dto.team_id,
        player_id: dto.player_id as any,
        period: dto.period,
        clock_time: dto.clock_time,
        event_type: `STAT_${dto.stat_type}`,
        event_value: eventValue,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return { success: true, event };
  }

  async getPlayerStats(gameId: number, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership) throw new UnauthorizedException('User has no league configured.');
    await this.getLeagueGame(gameId, membership.league_id);

    const rosterStats = await this.db
      .selectFrom('game.GameStats as gs')
      .innerJoin('player.Player as p', 'p.id', 'gs.player_id')
      .select([
        'gs.player_id',
        'gs.team_id',
        'p.full_name',
        'gs.points',
        'gs.assists',
        'gs.rebounds',
        'gs.steal',
        'gs.blocks',
        'gs.personal_fouls',
        'gs.minutes_played',
      ])
      .where('gs.game_id', '=', gameId as any)
      .execute();

    const events = await this.db
      .selectFrom('game.GameEvent')
      .select(['player_id', 'team_id', 'event_type', 'event_value'])
      .where('game_id', '=', gameId as any)
      .where('event_type', 'not like', 'AUDIT_%')
      .execute();

    const acc = new Map<string, any>();
    for (const row of rosterStats) {
      const key = `${row.team_id}:${row.player_id}`;
      acc.set(key, {
        player_id: Number(row.player_id),
        team_id: row.team_id,
        full_name: row.full_name,
        points: Number(row.points ?? 0),
        oreb: 0,
        dreb: 0,
        reb: Number(row.rebounds ?? 0),
        assists: Number(row.assists ?? 0),
        turnovers: 0,
        steals: Number(row.steal ?? 0),
        blocks: Number(row.blocks ?? 0),
        personal_fouls: Number(row.personal_fouls ?? 0),
        foul_out: false,
        minutes_played: Number(row.minutes_played ?? 0),
        fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
      });
    }

    const ensure = (teamId: number, playerId: any) => {
      const key = `${teamId}:${Number(playerId)}`;
      if (!acc.has(key)) {
        acc.set(key, {
          player_id: Number(playerId), team_id: teamId, full_name: `Player ${playerId}`,
          points: 0, oreb: 0, dreb: 0, reb: 0, assists: 0, turnovers: 0, steals: 0, blocks: 0,
          personal_fouls: 0, foul_out: false, minutes_played: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
        });
      }
      return acc.get(key);
    };

    for (const ev of events) {
      const r = ensure(ev.team_id, ev.player_id);
      const t = ev.event_type;
      const v = Number(ev.event_value ?? 1);
      if (t === 'SCORE_FT') { r.ftm += 1; r.fta += 1; r.fgm += 1; r.fga += 1; r.points += 1; }
      else if (t === 'SCORE_2PT') { r.fgm += 1; r.fga += 1; r.points += 2; }
      else if (t === 'SCORE_3PT') { r.fgm += 1; r.fga += 1; r.tpm += 1; r.tpa += 1; r.points += 3; }
      else if (t === 'STAT_MISS_FT') { r.fta += v; }
      else if (t === 'STAT_MISS_2PT') { r.fga += v; }
      else if (t === 'STAT_MISS_3PT') { r.fga += v; r.tpa += v; }
      else if (t === 'STAT_OREB') { r.oreb += v; r.reb += v; }
      else if (t === 'STAT_DREB') { r.dreb += v; r.reb += v; }
      else if (t === 'STAT_AST') { r.assists += v; }
      else if (t === 'STAT_TOV') { r.turnovers += v; }
      else if (t === 'STAT_STL') { r.steals += v; }
      else if (t === 'STAT_BLK') { r.blocks += v; }
      else if (t === 'STAT_PF') { r.personal_fouls += v; }
      else if (t === 'STAT_MIN') { r.minutes_played += v; }
      else if (t === 'SUB_OUT') { r.minutes_played += v; }
      r.foul_out = r.personal_fouls >= 6;
    }

    return Array.from(acc.values()).sort((a, b) => a.team_id - b.team_id || a.full_name.localeCompare(b.full_name));
  }

  async logSubstitution(gameId: number, dto: LogSubstitutionDto, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership) throw new UnauthorizedException('User has no league configured.');
    const game = await this.getLeagueGame(gameId, membership.league_id);
    if (Number(game.status) !== 1) throw new BadRequestException('Substitutions can only be logged for live games.');
    if (!/^\d{2}:\d{2}$/.test(dto.clock_time)) throw new BadRequestException('clock_time must be in HH:mm format.');
    if (dto.player_in_id === dto.player_out_id) throw new BadRequestException('player_in_id and player_out_id must be different.');

    const stats = await this.getPlayerStats(gameId, userId);
    const incoming = stats.find((s) => s.player_id === dto.player_in_id && s.team_id === dto.team_id);
    if (incoming?.foul_out) {
      throw new BadRequestException('Fouled-out players cannot re-enter the game.');
    }

    const minutesDelta = this.clockToMinutes(dto.clock_time);
    await this.db.transaction().execute(async (trx) => {
      await trx.insertInto('game.GameEvent').values({
        game_id: gameId as any,
        team_id: dto.team_id,
        player_id: dto.player_out_id as any,
        period: dto.period,
        clock_time: dto.clock_time,
        event_type: 'SUB_OUT',
        event_value: minutesDelta,
      }).execute();
      await trx.insertInto('game.GameEvent').values({
        game_id: gameId as any,
        team_id: dto.team_id,
        player_id: dto.player_in_id as any,
        period: dto.period,
        clock_time: dto.clock_time,
        event_type: 'SUB_IN',
        event_value: 0,
      }).execute();
    });
    return { success: true };
  }

  async clockAction(gameId: number, dto: ClockActionDto, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership) throw new UnauthorizedException('User has no league configured.');
    const game = await this.getLeagueGame(gameId, membership.league_id);
    if (Number(game.status) !== 1) throw new BadRequestException('Clock actions can only be done on live games.');

    const latestClockEvent = await this.db
      .selectFrom('game.GameEvent')
      .select(['event_type'])
      .where('game_id', '=', gameId as any)
      .where('event_type', 'like', 'CLOCK_%')
      .orderBy('id', 'desc')
      .executeTakeFirst();
    const isRunning = latestClockEvent?.event_type === 'CLOCK_STARTED' || latestClockEvent?.event_type === 'CLOCK_RESUMED';

    if (dto.action === 'start' && isRunning) throw new BadRequestException('Clock already running.');
    if (dto.action === 'resume' && isRunning) throw new BadRequestException('Clock already running.');
    if (dto.action === 'pause' && !isRunning) throw new BadRequestException('Clock is not running.');
    if (dto.action === 'end_period' && isRunning) throw new BadRequestException('Pause clock before ending period.');

    const actionMap: Record<ClockActionDto['action'], string> = {
      start: 'CLOCK_STARTED',
      pause: 'CLOCK_PAUSED',
      resume: 'CLOCK_RESUMED',
      end_period: 'PERIOD_ENDED',
      start_overtime: 'OVERTIME_STARTED',
    };

    let period = 1;
    if (dto.action === 'start_overtime') {
      const periodEvents = await this.db
        .selectFrom('game.GameEvent')
        .select(['period'])
        .where('game_id', '=', gameId as any)
        .where('event_type', 'in', ['PERIOD_ENDED', 'OVERTIME_STARTED'] as any)
        .orderBy('id', 'desc')
        .execute();
      period = Math.max(4, ...(periodEvents.map((e) => Number(e.period || 1)))) + 1;
    } else {
      const lastEvent = await this.db
        .selectFrom('game.GameEvent')
        .select(['period'])
        .where('game_id', '=', gameId as any)
        .orderBy('id', 'desc')
        .executeTakeFirst();
      period = Number(lastEvent?.period || 1);
    }

    await this.db.insertInto('game.GameEvent').values({
      game_id: gameId as any,
      team_id: Number(game.home_team),
      player_id: 0 as any,
      period,
      clock_time: dto.clock_time ?? '00:00',
      event_type: actionMap[dto.action],
      event_value: 0,
    }).execute();

    if (dto.action === 'end_period') {
      const refreshed = await this.db.selectFrom('game.Game').select(['home_score', 'away_score']).where('id', '=', gameId as any).executeTakeFirstOrThrow();
      if (period >= 4 && Number(refreshed.home_score) === Number(refreshed.away_score)) {
        return { success: true, requiresOvertime: true, nextOvertimeLabel: `OT${period - 3}` };
      }
    }

    return { success: true, requiresOvertime: false };
  }

  async finalizeGame(gameId: number, dto: FinalizeGameDto, userId: string) {
    if (!dto.confirm) throw new BadRequestException('confirm must be true to finalize game.');
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership) throw new UnauthorizedException('User has no league configured.');
    const game = await this.getLeagueGame(gameId, membership.league_id);
    if (Number(game.status) !== 1) throw new BadRequestException('Only live games can be finalized.');

    const playerStats = await this.getPlayerStats(gameId, userId);
    const byTeam = new Map<number, any[]>();
    for (const row of playerStats) {
      const arr = byTeam.get(row.team_id) ?? [];
      arr.push(row);
      byTeam.set(row.team_id, arr);
    }
    const summarize = (teamId: number) => {
      const rows = byTeam.get(teamId) ?? [];
      const sum = rows.reduce((a, r) => ({
        points: a.points + r.points,
        fgm: a.fgm + r.fgm,
        fga: a.fga + r.fga,
        tpm: a.tpm + r.tpm,
        tpa: a.tpa + r.tpa,
        ftm: a.ftm + r.ftm,
        fta: a.fta + r.fta,
      }), { points: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 });
      const pct = (m: number, a: number) => (a > 0 ? Number(((m / a) * 100).toFixed(2)) : 0);
      return {
        ...sum,
        fg_pct: pct(sum.fgm, sum.fga),
        tp_pct: pct(sum.tpm, sum.tpa),
        ft_pct: pct(sum.ftm, sum.fta),
      };
    };

    const homeSummary = summarize(Number(game.home_team));
    const awaySummary = summarize(Number(game.away_team));
    const boxscorePayload = {
      finalized_at: new Date().toISOString(),
      teams: {
        home_team_id: Number(game.home_team),
        away_team_id: Number(game.away_team),
        home: homeSummary,
        away: awaySummary,
      },
      players: playerStats,
      standings_update_triggered: true,
      stats_update_triggered: true,
      locked: true,
    };

    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('game.GameSummary')
        .values({
          game_id: gameId as any,
          highlights: JSON.stringify({ boxscore: boxscorePayload }),
          narrative: 'Finalized game box score generated.',
        })
        .execute();
      await trx.updateTable('game.Game').set({ status: 2 as any }).where('id', '=', gameId as any).execute();
      await trx.insertInto('game.GameEvent').values({
        game_id: gameId as any,
        team_id: Number(game.home_team),
        player_id: 0 as any,
        period: 0,
        clock_time: '00:00',
        event_type: 'GAME_FINALIZED',
        event_value: 0,
      }).execute();
    });

    return { success: true, boxscore: boxscorePayload };
  }

  async publishGameSummary(gameId: number, dto: PublishGameSummaryDto, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership) throw new UnauthorizedException('User has no league configured.');
    const game = await this.getLeagueGame(gameId, membership.league_id);
    if (!dto.narrative?.trim()) throw new BadRequestException('narrative is required.');

    const finalScore = await this.db
      .selectFrom('game.Game')
      .select(['home_score', 'away_score', 'home_team', 'away_team'])
      .where('id', '=', gameId as any)
      .executeTakeFirstOrThrow();

    const payload = {
      final_score: `${finalScore.home_score}-${finalScore.away_score}`,
      key_performers: dto.key_performers ?? '',
      notable_events: dto.notable_events ?? '',
      highlights: dto.highlights ?? '',
      published_public: true,
    };

    await this.db
      .insertInto('game.GameSummary')
      .values({
        game_id: gameId as any,
        narrative: dto.narrative,
        highlights: JSON.stringify(payload),
      })
      .execute();

    await this.db.insertInto('game.GameEvent').values({
      game_id: gameId as any,
      team_id: Number(game.home_team),
      player_id: 0 as any,
      period: 0,
      clock_time: '00:00',
      event_type: 'SUMMARY_PUBLISHED',
      event_value: 1,
    }).execute();

    return { success: true };
  }

  async getPublicGameSummary(gameId: number) {
    const summary = await this.db
      .selectFrom('game.GameSummary')
      .selectAll()
      .where('game_id', '=', gameId as any)
      .orderBy('published_at', 'desc')
      .executeTakeFirst();
    if (!summary) throw new NotFoundException('Published summary not found.');
    return {
      game_id: Number(summary.game_id),
      narrative: summary.narrative,
      highlights: summary.highlights,
      published_at: summary.published_at,
    };
  }

  async setGameAwards(gameId: number, dto: SetGameAwardsDto, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership) throw new UnauthorizedException('User has no league configured.');
    const game = await this.db
      .selectFrom('game.Game as g')
      .innerJoin('league.Season as s', 's.id', 'g.season_id')
      .select(['g.id', 'g.home_team', 'g.away_team', 'g.home_score', 'g.away_score', 'g.status', 'g.season_id'])
      .where('g.id', '=', gameId as any)
      .where('s.league_id', '=', membership.league_id)
      .executeTakeFirst();
    if (!game) throw new NotFoundException('Match not found or does not belong to your league.');
    if (Number(game.status) !== 2) throw new BadRequestException('Awards can only be assigned after game finalization.');

    const winningTeamId =
      Number(game.home_score) >= Number(game.away_score) ? Number(game.home_team) : Number(game.away_team);
    const losingTeamId =
      Number(game.home_score) >= Number(game.away_score) ? Number(game.away_team) : Number(game.home_team);

    const bpogRoster = await this.db
      .selectFrom('player.Roster')
      .select(['player_id'])
      .where('season_id', '=', Number(game.season_id))
      .where('team_id', '=', winningTeamId)
      .where('player_id', '=', dto.bpog_player_id as any)
      .executeTakeFirst();
    if (!bpogRoster) throw new BadRequestException('BPOG must be selected from the winning roster.');

    if (dto.mvp_losing_player_id) {
      const losingRoster = await this.db
        .selectFrom('player.Roster')
        .select(['player_id'])
        .where('season_id', '=', Number(game.season_id))
        .where('team_id', '=', losingTeamId)
        .where('player_id', '=', dto.mvp_losing_player_id as any)
        .executeTakeFirst();
      if (!losingRoster) throw new BadRequestException('Losing MVP must be selected from the losing roster.');
    }

    await this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('game.Award').where('game_id', '=', gameId as any).execute();
      await trx.insertInto('game.Award').values({
        game_id: gameId as any,
        season_id: Number(game.season_id),
        player_id: dto.bpog_player_id as any,
        award_type: 'BPOG',
        description: 'Best Player of the Game',
      }).execute();
      if (dto.mvp_losing_player_id) {
        await trx.insertInto('game.Award').values({
          game_id: gameId as any,
          season_id: Number(game.season_id),
          player_id: dto.mvp_losing_player_id as any,
          award_type: 'MVP_LOSER',
          description: 'MVP from losing team',
        }).execute();
      }
    });

    return { success: true };
  }

  async getSeasonAwardsLeaderboard(seasonId: number, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership) throw new UnauthorizedException('User has no league configured.');
    const rows = await this.db
      .selectFrom('game.Award as a')
      .innerJoin('player.Player as p', 'p.id', 'a.player_id')
      .innerJoin('game.Game as g', 'g.id', 'a.game_id')
      .innerJoin('league.Season as s', 's.id', 'g.season_id')
      .select(['a.player_id', 'p.full_name', 'a.award_type'])
      .where('a.season_id', '=', seasonId)
      .where('s.league_id', '=', membership.league_id)
      .execute();

    const map = new Map<number, { player_id: number; full_name: string; bpog_count: number; mvp_loser_count: number }>();
    for (const r of rows) {
      const id = Number(r.player_id);
      if (!map.has(id)) map.set(id, { player_id: id, full_name: r.full_name, bpog_count: 0, mvp_loser_count: 0 });
      const v = map.get(id)!;
      if (r.award_type === 'BPOG') v.bpog_count += 1;
      if (r.award_type === 'MVP_LOSER') v.mvp_loser_count += 1;
    }
    return Array.from(map.values()).sort((a, b) => b.bpog_count - a.bpog_count || b.mvp_loser_count - a.mvp_loser_count);
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

  private clockToMinutes(clockTime: string) {
    const [hh, mm] = clockTime.split(':').map(Number);
    return Math.max(0, hh) + Math.max(0, mm) / 60;
  }

  private validateGameStatusTransition(currentStatus: number, nextStatus: number) {
    if (![0, 1, 2].includes(nextStatus)) {
      throw new BadRequestException('Invalid game status. Allowed values: 0 (Scheduled), 1 (Live), 2 (Finished).');
    }
    if (currentStatus === nextStatus) {
      return;
    }
    const allowedTransitions: Record<number, number[]> = {
      0: [1, 2],
      1: [2],
      2: [],
    };
    const allowed = allowedTransitions[currentStatus] ?? [];
    if (!allowed.includes(nextStatus)) {
      throw new BadRequestException(
        `Invalid game status transition from ${currentStatus} to ${nextStatus}.`,
      );
    }
  }

  private validateInitializationInput(dto: InitializeGameDto) {
    if (!Array.isArray(dto.home_starter_player_ids) || dto.home_starter_player_ids.length !== 5) {
      throw new BadRequestException('home_starter_player_ids must contain exactly 5 players.');
    }
    if (!Array.isArray(dto.away_starter_player_ids) || dto.away_starter_player_ids.length !== 5) {
      throw new BadRequestException('away_starter_player_ids must contain exactly 5 players.');
    }
    if (!Number.isInteger(dto.initial_period) || dto.initial_period <= 0) {
      throw new BadRequestException('initial_period must be a positive integer.');
    }
    if (!/^\d{2}:\d{2}$/.test(dto.initial_clock_time)) {
      throw new BadRequestException('initial_clock_time must be in HH:mm format.');
    }
  }

  private validateStartersAndDnp(dto: InitializeGameDto) {
    const unique = (arr: number[]) => new Set(arr).size === arr.length;
    if (!unique(dto.home_starter_player_ids) || !unique(dto.away_starter_player_ids)) {
      throw new BadRequestException('Starter player ids must be unique per team.');
    }
    const hasOverlap = (arr1: number[], arr2: number[]) => arr1.some((v) => arr2.includes(v));
    if (hasOverlap(dto.home_starter_player_ids, dto.home_dnp_player_ids ?? [])) {
      throw new BadRequestException('Home starters cannot also be marked DNP.');
    }
    if (hasOverlap(dto.away_starter_player_ids, dto.away_dnp_player_ids ?? [])) {
      throw new BadRequestException('Away starters cannot also be marked DNP.');
    }
  }

  private async getLeagueGame(gameId: number, leagueId: number) {
    const game = await this.db
      .selectFrom('game.Game as g')
      .innerJoin('league.Season as s', 's.id', 'g.season_id')
      .select(['g.id', 'g.home_team', 'g.away_team', 'g.status', 's.status as season_status'])
      .where('g.id', '=', gameId as any)
      .where('s.league_id', '=', leagueId)
      .executeTakeFirst();
    if (!game) throw new NotFoundException('Match not found or does not belong to your league.');
    if (Number(game.season_status) === 3) throw new BadRequestException('Cannot modify games for an archived season.');
    return game;
  }

  private async ensureScheduleReadiness(seasonId: number, leagueId: number) {
    const readiness = await this.computeScheduleReadiness(seasonId, leagueId);
    if (!readiness.ready) {
      throw new BadRequestException(readiness.message);
    }
  }

  private async computeScheduleReadiness(seasonId: number, leagueId: number) {
    const season = await this.db
      .selectFrom('league.Season')
      .select(['id'])
      .where('id', '=', seasonId)
      .where('league_id', '=', leagueId)
      .executeTakeFirst();
    if (!season) throw new NotFoundException('Season not found or does not belong to your league.');

    const league = await this.db
      .selectFrom('league.League')
      .select(['rules_config'])
      .where('id', '=', leagueId)
      .executeTakeFirst();
    const minRequired = Number((league?.rules_config as any)?.min_roster_players ?? 5);

    const seasonTeams = await this.db
      .selectFrom('league.SeasonTeam as st')
      .innerJoin('league.Teams as t', 't.id', 'st.team_id')
      .select(['t.id', 't.name', 'st.is_finalized'])
      .where('st.season_id', '=', seasonId)
      .execute();
    if (seasonTeams.length < 2) {
      return { ready: false, message: 'Add at least 2 teams to this season before creating schedules.', rosterSummary: [] };
    }

    const rosterSummary: Array<{ team_id: number; team_name: string; active_roster_count: number; min_required: number; is_complete: boolean; is_finalized: boolean; ready: boolean; reasons: string[] }> = [];
    for (const team of seasonTeams) {
      const activeCount = await this.db
        .selectFrom('player.Roster')
        .select((eb) => eb.fn.count('id').as('count'))
        .where('season_id', '=', seasonId)
        .where('team_id', '=', team.id)
        .where('status', '=', 'Active')
        .executeTakeFirstOrThrow();
      const count = Number((activeCount as any).count ?? 0);
      const isComplete = count >= minRequired;
      const isFinalized = Boolean((team as any).is_finalized);
      const reasons: string[] = [];
      if (!isComplete) reasons.push('insufficient_active_players');
      if (!isFinalized) reasons.push('not_finalized');
      rosterSummary.push({
        team_id: team.id,
        team_name: team.name,
        active_roster_count: count,
        min_required: minRequired,
        is_complete: isComplete,
        is_finalized: isFinalized,
        ready: isComplete && isFinalized,
        reasons,
      });
    }
    const insufficient = rosterSummary.filter((r) => !r.ready);
    if (insufficient.length > 0) {
      return {
        ready: false,
        message: 'All season teams must have at least 5 active roster players before creating schedules.',
        rosterSummary,
      };
    }
    return { ready: true, message: 'Schedule can be created.', rosterSummary };
  }
}
