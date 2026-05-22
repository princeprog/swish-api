import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

jest.mock('kysely', () => ({
  sql: jest.fn(() => new Date()),
}));

import { SeasonService } from './season.service';

describe('SeasonService', () => {
  function createDb() {
    const state = {
      membership: { league_id: 12, role: 'league_admin' },
      season: {
        id: 5,
        league_id: 12,
        name: 'Summer 2026',
        start_date: new Date('2026-06-01'),
        end_date: new Date('2026-08-01'),
        playoff_format: 'best_of_three',
        status: 1,
      },
      inserts: [] as Array<{ table: string; values: any }>,
    };

    const db = {
      selectFrom: jest.fn((table: string) => {
        const filters: Record<string, any> = {};
        const builder = {
          selectAll: jest.fn(() => builder),
          select: jest.fn(() => builder),
          where: jest.fn((column: string, _op: string, value: any) => {
            filters[column] = value;
            return builder;
          }),
          orderBy: jest.fn(() => builder),
          execute: jest.fn(async () => [state.season]),
          executeTakeFirst: jest.fn(async () => {
            if (table === 'auth.users') {
              return { active_league_id: state.membership.league_id };
            }
            if (table === 'league.league_members') {
              if (filters.user_id === 'league-admin-user') return state.membership;
              return undefined;
            }
            if (table === 'league.Season') {
              if (filters.id === state.season.id && filters.league_id === state.season.league_id) {
                return state.season;
              }
              return undefined;
            }
            return undefined;
          }),
        };
        return builder;
      }),
      insertInto: jest.fn((table: string) => ({
        values: jest.fn((values: any) => {
          state.inserts.push({ table, values });
          return {
            returningAll: jest.fn(() => ({
              executeTakeFirstOrThrow: jest.fn(async () => {
                if (table === 'league.Season') return state.season;
                return { id: state.inserts.length, ...values };
              }),
            })),
            execute: jest.fn(async () => []),
          };
        }),
      })),
      updateTable: jest.fn((table: string) => {
        if (table === 'auth.users') {
          const userBuilder = {
            set: jest.fn(() => userBuilder),
            where: jest.fn(() => userBuilder),
            execute: jest.fn(async () => []),
          };
          return userBuilder;
        }
        if (table !== 'league.Season') throw new Error('Unexpected table');
        const filters: Record<string, any> = {};
        let nextValues: Record<string, any> = {};
        const builder = {
          set: jest.fn((values: Record<string, any>) => {
            nextValues = values;
            return builder;
          }),
          where: jest.fn((column: string, _op: string, value: any) => {
            filters[column] = value;
            return builder;
          }),
          returningAll: jest.fn(() => ({
            executeTakeFirst: jest.fn(async () => {
              if (filters.id !== state.season.id || filters.league_id !== state.season.league_id) {
                return undefined;
              }
              state.season = { ...state.season, ...nextValues };
              return state.season;
            }),
          })),
        };
        return builder;
      }),
    };

    return { db: db as any, state };
  }

  it('rejects create when end date is before start date', async () => {
    const { db } = createDb();
    const service = new SeasonService(db);

    await expect(
      service.create(
        {
          name: 'Bad Season',
          start_date: '2026-08-01',
          end_date: '2026-06-01',
          playoff_format: 'best_of_three',
        },
        'league-admin-user',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects create when playoff format is unsupported', async () => {
    const { db } = createDb();
    const service = new SeasonService(db);

    await expect(
      service.create(
        {
          name: 'Bad Season',
          start_date: '2026-06-01',
          end_date: '2026-08-01',
          playoff_format: 'invalid_format',
        },
        'league-admin-user',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('seeds editable default season requirements for new seasons', async () => {
    const { db, state } = createDb();
    const service = new SeasonService(db);

    await service.create(
      {
        name: 'Summer 2026',
        start_date: '2026-06-01',
        end_date: '2026-08-01',
        playoff_format: 'best_of_three',
      },
      'league-admin-user',
    );

    const complianceInserts = state.inserts.filter((i) => i.table === 'league.team_compliance_items');
    const roleInserts = state.inserts.filter((i) => i.table === 'league.team_staff_required_roles');

    expect(complianceInserts.map((i) => i.values.key)).toEqual([
      'roster_size_requirement',
      'proof_of_entrance_registration',
      'team_identity',
      'coaching_staff_contacts',
      'uniform_set',
      'player_eligibility_documents',
    ]);
    expect(complianceInserts[0].values.config).toEqual({
      validation_mode: 'auto',
      auto_source: 'roster_count',
      roster_rules: { min_players: 5, max_players: 15 },
    });
    expect(complianceInserts[1].values.config).toEqual({
      validation_mode: 'evidence',
      evidence_rules: { min_files: 1, allow_notes: true },
    });
    expect(complianceInserts[2].values.config).toEqual({
      validation_mode: 'auto',
      auto_source: 'team_identity',
    });
    expect(complianceInserts[3].values.config).toEqual({
      validation_mode: 'auto',
      auto_source: 'required_staff_roles',
    });
    expect(roleInserts.map((i) => i.values.role)).toEqual(['head_coach', 'team_manager']);
  });

  it('allows season creation without default requirements when explicitly disabled', async () => {
    const { db, state } = createDb();
    const service = new SeasonService(db);

    await service.create(
      {
        name: 'Summer 2026',
        start_date: '2026-06-01',
        end_date: '2026-08-01',
        playoff_format: 'best_of_three',
        create_default_requirements: false,
      },
      'league-admin-user',
    );

    expect(state.inserts.some((i) => i.table === 'league.team_compliance_items')).toBe(false);
    expect(state.inserts.some((i) => i.table === 'league.team_staff_required_roles')).toBe(false);
  });

  it('archives an active season for league admin in same league', async () => {
    const { db } = createDb();
    const service = new SeasonService(db);

    const result = await service.archive(5, 'league-admin-user');

    expect(result.success).toBe(true);
    expect(result.season.status).toBe(3);
  });

  it('rejects archive when season is already archived', async () => {
    const { db, state } = createDb();
    state.season.status = 3;
    const service = new SeasonService(db);

    await expect(service.archive(5, 'league-admin-user')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects archive for users outside the league', async () => {
    const { db } = createDb();
    const service = new SeasonService(db);

    await expect(service.archive(5, 'other-user')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects archive when season does not exist in user league', async () => {
    const { db } = createDb();
    const service = new SeasonService(db);

    await expect(service.archive(99, 'league-admin-user')).rejects.toBeInstanceOf(NotFoundException);
  });
});
