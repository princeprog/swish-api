import { sql, type Kysely } from 'kysely'

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function up(db: Kysely<any>): Promise<void> {
  // Definitions of compliance requirements (scoped to league, optionally season/division).
  await db.schema
    .withSchema('league')
    .createTable('team_compliance_items')
    .addColumn('id', 'bigserial', (col) => col.primaryKey())
    .addColumn('league_id', 'integer', (col) =>
      col.notNull().references('league.League.id').onDelete('cascade'),
    )
    .addColumn('season_id', 'integer', (col) =>
      col.references('league.Season.id').onDelete('cascade'),
    )
    .addColumn('division_id', 'integer', (col) =>
      col.references('league.SeasonDivision.id').onDelete('cascade'),
    )
    .addColumn('key', 'varchar(64)', (col) => col.notNull())
    .addColumn('label', 'varchar(255)', (col) => col.notNull())
    .addColumn('category', 'varchar(64)', (col) => col.notNull())
    .addColumn('is_required', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('sort_order', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('config', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('archived_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .withSchema('league')
    .createIndex('team_compliance_items_league_id_index')
    .on('team_compliance_items')
    .column('league_id')
    .execute()

  await db.schema
    .withSchema('league')
    .createIndex('team_compliance_items_season_id_index')
    .on('team_compliance_items')
    .column('season_id')
    .execute()

  await db.schema
    .withSchema('league')
    .createIndex('team_compliance_items_division_id_index')
    .on('team_compliance_items')
    .column('division_id')
    .execute()

  // Keys should be unique within a league+season+division scope (nulls allowed).
  await db.schema
    .withSchema('league')
    .createIndex('team_compliance_items_scope_key_unique')
    .on('team_compliance_items')
    .columns(['league_id', 'season_id', 'division_id', 'key'])
    .unique()
    .execute()

  // Status per team per season per item.
  await db.schema
    .withSchema('league')
    .createTable('team_compliance_status')
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
    .addColumn('item_id', 'bigint', (col) =>
      col.notNull().references('league.team_compliance_items.id').onDelete('cascade'),
    )
    .addColumn('status', 'varchar(32)', (col) => col.notNull()) // pending | complete | waived
    .addColumn('notes', 'text')
    .addColumn('updated_by_user_id', 'uuid', (col) =>
      col.references('auth.users.id').onDelete('set null'),
    )
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .withSchema('league')
    .createIndex('team_compliance_status_league_season_team_index')
    .on('team_compliance_status')
    .columns(['league_id', 'season_id', 'team_id'])
    .execute()

  await db.schema
    .withSchema('league')
    .createIndex('team_compliance_status_item_id_index')
    .on('team_compliance_status')
    .column('item_id')
    .execute()

  await db.schema
    .withSchema('league')
    .createIndex('team_compliance_status_unique')
    .on('team_compliance_status')
    .columns(['season_id', 'team_id', 'item_id'])
    .unique()
    .execute()
}

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.withSchema('league').dropTable('team_compliance_status').ifExists().execute()
  await db.schema.withSchema('league').dropTable('team_compliance_items').ifExists().execute()
}
