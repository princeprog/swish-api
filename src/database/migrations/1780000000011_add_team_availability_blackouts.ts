import { sql, type Kysely } from 'kysely'

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .withSchema('league')
    .createTable('team_availability')
    .addColumn('id', 'bigserial', (col) => col.primaryKey())
    .addColumn('league_id', 'integer', (col) =>
      col.notNull().references('league.League.id').onDelete('cascade'),
    )
    .addColumn('season_id', 'integer', (col) =>
      col.notNull().references('league.Season.id').onDelete('cascade'),
    )
    .addColumn('team_id', 'integer', (col) =>
      col.notNull().references('league.Teams.id').onDelete('cascade'),
    )
    // Array of YYYY-MM-DD strings.
    .addColumn('blackout_dates', 'jsonb', (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn('notes', 'text')
    .addColumn('updated_by_user_id', 'uuid', (col) =>
      col.references('auth.users.id').onDelete('set null'),
    )
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .withSchema('league')
    .createIndex('team_availability_league_season_team_unique')
    .on('team_availability')
    .columns(['league_id', 'season_id', 'team_id'])
    .unique()
    .execute()
}

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.withSchema('league').dropTable('team_availability').ifExists().execute()
}
