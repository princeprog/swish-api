import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { LeagueService } from './league.service';

describe('LeagueService', () => {
  const baseLeague = {
    id: 12,
    name: 'Swish Elite',
    logo_url: '',
    description: 'Desc',
    location: 'Manila',
    contact_info: 'contact@swish.test',
    rules_config: {
      period_count: 4,
      period_duration_minutes: 10,
      shot_clock_seconds: 24,
      overtime_duration_minutes: 5,
    },
  };

  function createDb() {
    const state = {
      league: { ...baseLeague },
      membership: { league_id: 12, role: 'league_admin' },
    };

    const db = {
      selectFrom: jest.fn((table: string) => {
        const filters: Record<string, any> = {};
        const builder = {
          selectAll: jest.fn(() => builder),
          select: jest.fn(() => builder),
          where: jest.fn((column: string, _operator: string, value: any) => {
            filters[column] = value;
            return builder;
          }),
          executeTakeFirst: jest.fn(async () => {
            if (table === 'league.league_members') {
              if (filters.user_id === 'league-admin-user') {
                return state.membership;
              }
              return undefined;
            }
            if (table === 'league.League' && filters.id === state.league.id) {
              return state.league;
            }
            return undefined;
          }),
          executeTakeFirstOrThrow: jest.fn(async () => {
            const value = await builder.executeTakeFirst();
            if (!value) throw new Error('not found');
            return value;
          }),
        };
        return builder;
      }),
      transaction: jest.fn(() => ({
        execute: async (fn: any) =>
          fn({
            insertInto: jest.fn(() => ({
              values: jest.fn(() => ({
                returningAll: jest.fn(() => ({
                  executeTakeFirstOrThrow: jest.fn(async () => state.league),
                })),
                execute: jest.fn(async () => undefined),
              })),
            })),
          }),
      })),
      updateTable: jest.fn((table: string) => {
        if (table !== 'league.League') {
          throw new Error('Unexpected table');
        }
        const filters: Record<string, any> = {};
        let nextValues: Record<string, any> = {};
        const builder = {
          set: jest.fn((values: Record<string, any>) => {
            nextValues = values;
            return builder;
          }),
          where: jest.fn((column: string, _operator: string, value: any) => {
            filters[column] = value;
            return builder;
          }),
          returningAll: jest.fn(() => ({
            executeTakeFirstOrThrow: jest.fn(async () => {
              if (filters.id !== state.league.id) throw new Error('not found');
              state.league = {
                ...state.league,
                ...nextValues,
                rules_config: JSON.parse(nextValues.rules_config),
              };
              return state.league;
            }),
          })),
        };
        return builder;
      }),
    };

    return { db: db as any, state };
  }

  it('rejects create requests with invalid rules configuration', async () => {
    const { db } = createDb();
    const service = new LeagueService(db);

    await expect(
      service.create(
        {
          name: 'New League',
          description: 'desc',
          location: 'Manila',
          contact_info: 'contact@test.dev',
          rules_config: {
            period_duration_minutes: 0,
            shot_clock_seconds: 24,
            overtime_duration_minutes: 5,
          },
        },
        'league-admin-user',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates league configuration for the owning league admin', async () => {
    const { db, state } = createDb();
    const service = new LeagueService(db);

    const result = await service.updateLeagueConfiguration(12, 'league-admin-user', {
      rules_config: {
        period_count: 4,
        period_duration_minutes: 12,
        shot_clock_seconds: 24,
        overtime_duration_minutes: 5,
      },
      location: 'Quezon City',
    });

    expect(result.success).toBe(true);
    expect(result.league.location).toBe('Quezon City');
    expect(result.league.rules_config.period_duration_minutes).toBe(12);
    expect(state.league.rules_config.period_duration_minutes).toBe(12);
  });

  it('prevents a league admin from updating another league configuration', async () => {
    const { db } = createDb();
    const service = new LeagueService(db);

    await expect(
      service.updateLeagueConfiguration(99, 'league-admin-user', {
        description: 'attempt',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
