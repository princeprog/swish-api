import { sql, type Kysely } from 'kysely'

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .withSchema('league')
    .createTable('SeasonDivision')
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('season_id', 'integer', (col) =>
      col.notNull().references('league.Season.id').onDelete('cascade'),
    )
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('code', 'varchar(64)', (col) => col.notNull())
    .addColumn('sort_order', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('age_min', 'integer')
    .addColumn('age_max', 'integer')
    .addColumn('is_open', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .withSchema('league')
    .createIndex('season_division_season_id_index')
    .on('SeasonDivision')
    .column('season_id')
    .execute()

  await db.schema
    .withSchema('league')
    .createIndex('season_division_season_id_sort_order_index')
    .on('SeasonDivision')
    .columns(['season_id', 'sort_order'])
    .execute()

  // Keep codes unique within a season for stable filtering and URLs.
  await db.schema
    .withSchema('league')
    .createIndex('season_division_season_id_code_unique')
    .on('SeasonDivision')
    .columns(['season_id', 'code'])
    .unique()
    .execute()
}

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .withSchema('league')
    .dropTable('SeasonDivision')
    .ifExists()
    .execute()
}
