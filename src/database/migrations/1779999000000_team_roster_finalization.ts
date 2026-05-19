import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .withSchema('league')
    .alterTable('SeasonTeam')
    .addColumn('is_finalized', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('finalized_by_user_id', 'uuid')
    .addColumn('finalized_at', 'timestamptz')
    .addColumn('min_required_players_snapshot', 'integer')
    .execute();

  await db.schema
    .withSchema('league')
    .alterTable('SeasonTeam')
    .addForeignKeyConstraint(
      'season_team_finalized_by_user_fk',
      ['finalized_by_user_id'],
      'auth.users',
      ['id'],
      (cb) => cb.onDelete('set null'),
    )
    .execute();

  await db.schema
    .withSchema('league')
    .createIndex('season_team_is_finalized_idx')
    .on('SeasonTeam')
    .column('is_finalized')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .withSchema('league')
    .dropIndex('season_team_is_finalized_idx')
    .ifExists()
    .execute();

  await db.schema
    .withSchema('league')
    .alterTable('SeasonTeam')
    .dropConstraint('season_team_finalized_by_user_fk')
    .ifExists()
    .execute();

  await db.schema
    .withSchema('league')
    .alterTable('SeasonTeam')
    .dropColumn('min_required_players_snapshot')
    .dropColumn('finalized_at')
    .dropColumn('finalized_by_user_id')
    .dropColumn('is_finalized')
    .execute();
}
