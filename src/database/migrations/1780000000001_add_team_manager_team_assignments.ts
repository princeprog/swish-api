import { sql, type Kysely } from 'kysely';

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .withSchema('league')
    .createTable('team_manager_teams')
    .addColumn('league_id', 'integer', (col) =>
      col.notNull().references('league.League.id').onDelete('cascade'),
    )
    .addColumn('team_id', 'integer', (col) =>
      col.notNull().references('league.Teams.id').onDelete('cascade'),
    )
    .addColumn('user_id', 'uuid', (col) =>
      col.notNull().references('auth.users.id').onDelete('cascade'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addPrimaryKeyConstraint('team_manager_teams_pk', ['team_id', 'user_id'])
    .execute();

  await db.schema
    .withSchema('league')
    .createIndex('team_manager_teams_league_id_index')
    .on('team_manager_teams')
    .column('league_id')
    .execute();

  await db.schema
    .withSchema('league')
    .createIndex('team_manager_teams_user_id_index')
    .on('team_manager_teams')
    .column('user_id')
    .execute();
}

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .withSchema('league')
    .dropTable('team_manager_teams')
    .ifExists()
    .execute();
}

