import { sql, type Kysely } from 'kysely'

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function up(db: Kysely<any>): Promise<void> {
  // 1) Add nullable column first (so we can backfill safely).
  await db.schema
    .withSchema('league')
    .alterTable('SeasonTeam')
    .addColumn('division_id', 'integer', (col) =>
      col.references('league.SeasonDivision.id').onDelete('restrict'),
    )
    .execute()

  await db.schema
    .withSchema('league')
    .createIndex('season_team_division_id_index')
    .on('SeasonTeam')
    .column('division_id')
    .execute()

  await db.schema
    .withSchema('league')
    .createIndex('season_team_season_id_division_id_index')
    .on('SeasonTeam')
    .columns(['season_id', 'division_id'])
    .execute()

  // 2) Ensure every season with teams has a default "OPEN" division for backfill.
  await sql`
    insert into league."SeasonDivision"
      (season_id, name, code, sort_order, age_min, age_max, is_open, created_at, rules_config, archived_at)
    select
      st.season_id,
      'Open' as name,
      'OPEN' as code,
      0 as sort_order,
      null as age_min,
      null as age_max,
      true as is_open,
      now() as created_at,
      '{}'::jsonb as rules_config,
      null as archived_at
    from league."SeasonTeam" st
    where not exists (
      select 1
      from league."SeasonDivision" sd
      where sd.season_id = st.season_id
        and sd.code = 'OPEN'
        and sd.archived_at is null
    )
    group by st.season_id;
  `.execute(db)

  // 3) Backfill existing SeasonTeam rows.
  await sql`
    update league."SeasonTeam" st
    set division_id = sd.id
    from league."SeasonDivision" sd
    where st.season_id = sd.season_id
      and sd.code = 'OPEN'
      and sd.archived_at is null
      and st.division_id is null;
  `.execute(db)

  // 4) Enforce required division mapping.
  await sql`alter table league."SeasonTeam" alter column division_id set not null;`.execute(db)
}

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table league."SeasonTeam" alter column division_id drop not null;`.execute(db)
  await db.schema.withSchema('league').dropIndex('season_team_season_id_division_id_index').ifExists().execute()
  await db.schema.withSchema('league').dropIndex('season_team_division_id_index').ifExists().execute()
  await db.schema.withSchema('league').alterTable('SeasonTeam').dropColumn('division_id').execute()
}
