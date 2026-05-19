import { Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { DB } from 'src/database/db';
import { getUserLeagueMembership } from '../league/league-membership';
import { GameService } from '../game/game.service';

@Injectable()
export class PlayerService {
  constructor(
    @Inject('KYSELY_DB') private readonly db: Kysely<DB>,
    private readonly gameService: GameService,
  ) {}

  async getPerGameStats(playerId: number, seasonId: number | null, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership) throw new UnauthorizedException('User has no league configured.');

    const base = this.db
      .selectFrom('game.GameEvent as e')
      .innerJoin('game.Game as g', 'g.id', 'e.game_id')
      .innerJoin('league.Season as s', 's.id', 'g.season_id')
      .select(['e.game_id', 'g.season_id'])
      .where('e.player_id', '=', playerId as any)
      .where('s.league_id', '=', membership.league_id);
    const games = await (seasonId ? base.where('g.season_id', '=', seasonId).execute() : base.execute());

    const rows: any[] = [];
    for (const g of games) {
      const all = await this.gameService.getPlayerStats(Number(g.game_id), userId);
      const stat = all.find((s) => s.player_id === playerId);
      if (stat) rows.push({ game_id: Number(g.game_id), season_id: Number(g.season_id), ...stat });
    }
    return rows;
  }

  async getPlayerProfile(playerId: number, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership) throw new UnauthorizedException('User has no league configured.');
    const player = await this.db.selectFrom('player.Player').selectAll().where('id', '=', playerId as any).executeTakeFirst();
    if (!player) throw new NotFoundException('Player not found.');

    const perGame = await this.getPerGameStats(playerId, null, userId);
    const totalGames = perGame.length || 1;
    const sum = perGame.reduce((a: any, r: any) => ({
      points: a.points + r.points, reb: a.reb + r.reb, assists: a.assists + r.assists, steals: a.steals + r.steals, blocks: a.blocks + r.blocks,
      fgm: a.fgm + r.fgm, fga: a.fga + r.fga, tpm: a.tpm + r.tpm, tpa: a.tpa + r.tpa, ftm: a.ftm + r.ftm, fta: a.fta + r.fta, minutes: a.minutes + r.minutes_played,
    }), { points: 0, reb: 0, assists: 0, steals: 0, blocks: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, minutes: 0 });
    const pct = (m: number, a: number) => (a > 0 ? Number(((m / a) * 100).toFixed(2)) : 0);

    return {
      player,
      season_averages: {
        ppg: Number((sum.points / totalGames).toFixed(2)),
        rpg: Number((sum.reb / totalGames).toFixed(2)),
        apg: Number((sum.assists / totalGames).toFixed(2)),
        spg: Number((sum.steals / totalGames).toFixed(2)),
        bpg: Number((sum.blocks / totalGames).toFixed(2)),
        mpg: Number((sum.minutes / totalGames).toFixed(2)),
        fg_pct: pct(sum.fgm, sum.fga),
        tp_pct: pct(sum.tpm, sum.tpa),
        ft_pct: pct(sum.ftm, sum.fta),
      },
      career_totals: sum,
      games_played: perGame.length,
    };
  }
}
