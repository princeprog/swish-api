import { sql, type Kysely } from 'kysely'

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .withSchema('league')
    .createTable('team_staff')
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
    .addColumn('role', 'varchar(64)', (col) => col.notNull()) // head_coach, assistant_coach, team_manager, medic, etc.
    .addColumn('full_name', 'varchar(255)', (col) => col.notNull())
    .addColumn('email', 'varchar(255)')
    .addColumn('phone', 'varchar(64)')
    .addColumn('created_by_user_id', 'uuid', (col) =>
      col.references('auth.users.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .withSchema('league')
    .createIndex('team_staff_league_season_team_index')
    .on('team_staff')
    .columns(['league_id', 'season_id', 'team_id'])
    .execute()

  await db.schema
    .withSchema('league')
    .createIndex('team_staff_season_team_role_index')
    .on('team_staff')
    .columns(['season_id', 'team_id', 'role'])
    .execute()

  // Required role configuration (per league, optionally division/season).
  await db.schema
    .withSchema('league')
    .createTable('team_staff_required_roles')
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
    .addColumn('role', 'varchar(64)', (col) => col.notNull())
    .addColumn('label', 'varchar(255)', (col) => col.notNull())
    .addColumn('is_required', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('sort_order', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .withSchema('league')
    .createIndex('team_staff_required_roles_league_id_index')
    .on('team_staff_required_roles')
    .column('league_id')
    .execute()

  await db.schema
    .withSchema('league')
    .createIndex('team_staff_required_roles_scope_role_unique')
    .on('team_staff_required_roles')
    .columns(['league_id', 'season_id', 'division_id', 'role'])
    .unique()
    .execute()
}

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.withSchema('league').dropTable('team_staff_required_roles').ifExists().execute()
  await db.schema.withSchema('league').dropTable('team_staff').ifExists().execute()
}
