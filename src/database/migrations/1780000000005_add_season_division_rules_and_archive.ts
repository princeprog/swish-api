import { sql, type Kysely } from 'kysely'

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .withSchema('league')
    .alterTable('SeasonDivision')
    .addColumn('rules_config', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('archived_at', 'timestamptz')
    .execute()

  await db.schema
    .withSchema('league')
    .createIndex('season_division_season_id_archived_at_index')
    .on('SeasonDivision')
    .columns(['season_id', 'archived_at'])
    .execute()
}

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .withSchema('league')
    .alterTable('SeasonDivision')
    .dropColumn('rules_config')
    .dropColumn('archived_at')
    .execute()
}
