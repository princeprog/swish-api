import type { Kysely } from 'kysely'

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .withSchema('league')
    .alterTable('SeasonDivision')
    .addColumn('description', 'text')
    .addColumn('team_capacity', 'integer')
    .execute()
}

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .withSchema('league')
    .alterTable('SeasonDivision')
    .dropColumn('team_capacity')
    .dropColumn('description')
    .execute()
}
