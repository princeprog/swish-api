import { GameService } from './game.service';

describe('GameService round-robin generation', () => {
  function createDb() {
    const insertedGames: any[] = [];
    const state = {
      membership: { league_id: 12, role: 'league_admin' },
      season: { id: 99, status: 1 },
      teams: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
      existingGames: [
        {
          home_team: 1,
          away_team: 2,
          scheduled_at: new Date('2026-10-01T09:00:00.000Z'),
        },
      ],
      nextGameId: 1000,
    };

    const db = {
      selectFrom: jest.fn((table: string) => {
        const filters: Record<string, any> = {};
        const builder = {
          select: jest.fn(() => builder),
          selectAll: jest.fn(() => builder),
          where: jest.fn((column: string, _op: string, value: any) => {
            filters[column] = value;
            return builder;
          }),
          orderBy: jest.fn(() => builder),
          execute: jest.fn(async () => {
            if (table === 'league.Teams') return state.teams;
            if (table === 'game.Game') return state.existingGames;
            return [];
          }),
          executeTakeFirst: jest.fn(async () => {
            if (table === 'league.league_members') {
              return filters.user_id === 'league-admin-user' ? state.membership : undefined;
            }
            if (table === 'league.Season') {
              if (filters.id === state.season.id && filters.league_id === state.membership.league_id) {
                return state.season;
              }
            }
            return undefined;
          }),
        };
        return builder;
      }),
      transaction: jest.fn(() => ({
        execute: async (cb: any) =>
          cb({
            insertInto: (_table: string) => ({
              values: (payload: any) => ({
                returningAll: () => ({
                  executeTakeFirstOrThrow: async () => {
                    const game = { id: state.nextGameId++, ...payload };
                    insertedGames.push(game);
                    return game;
                  },
                }),
              }),
            }),
          }),
      })),
    };

    return { db: db as any, insertedGames };
  }

  it('generates round-robin fixtures with day-level conflict avoidance', async () => {
    const { db, insertedGames } = createDb();
    const service = new GameService(db);

    const result = await service.generateRoundRobinSchedule(
      {
        season_id: 99,
        start_date: '2026-10-01',
        game_time: '18:30',
        venue: 'Swish Arena',
        game_type: 'regular',
        frequency_days: 1,
        games_per_team: 3,
      },
      'league-admin-user',
    );

    expect(result.success).toBe(true);
    expect(result.generatedCount).toBe(6);
    expect(insertedGames).toHaveLength(6);
    // Existing 2026-10-01 already includes teams 1 and 2; first generated fixture must skip that day conflict.
    const firstDate = new Date(insertedGames[0].scheduled_at);
    expect(firstDate.toISOString().startsWith('2026-10-02')).toBe(true);
  });
});
