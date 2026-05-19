import { sql, type Kysely } from 'kysely'

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .withSchema('league')
    .createTable('season_team_identity')
    .addColumn('season_id', 'integer', (col) =>
      col.notNull().references('league.Season.id').onDelete('cascade'),
    )
    .addColumn('team_id', 'integer', (col) =>
      col.notNull().references('league.Teams.id').onDelete('cascade'),
    )
    .addColumn('display_name', 'varchar(255)')
    .addColumn('short_name', 'varchar(64)')
    .addColumn('logo_url', 'varchar(255)')
    .addColumn('primary_color', 'varchar(32)')
    .addColumn('secondary_color', 'varchar(32)')
    .addColumn('uniform_config', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('approved_at', 'timestamptz')
    .addColumn('approved_by_user_id', 'uuid', (col) =>
      col.references('auth.users.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('season_team_identity_pk', ['season_id', 'team_id'])
    .execute()

  await db.schema
    .withSchema('league')
    .createIndex('season_team_identity_team_id_index')
    .on('season_team_identity')
    .column('team_id')
    .execute()

  // Optional uniform enforcement: jersey numbers unique within team+season.
  // Clean up any existing duplicates before creating the unique index.
  await sql`
    delete from player."Roster" r
    using player."Roster" r2
    where r.id > r2.id
      and r.season_id = r2.season_id
      and r.team_id = r2.team_id
      and r.jersey_number = r2.jersey_number;
  `.execute(db)

  await db.schema
    .withSchema('player')
    .createIndex('roster_season_team_jersey_unique')
    .on('Roster')
    .columns(['season_id', 'team_id', 'jersey_number'])
    .unique()
    .execute()
}

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.withSchema('player').dropIndex('roster_season_team_jersey_unique').ifExists().execute()
  await db.schema.withSchema('league').dropTable('season_team_identity').ifExists().execute()
}
