import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table league."SeasonTeam" add column if not exists review_status varchar(32) not null default 'draft';`.execute(db);
  await sql`alter table league."SeasonTeam" add column if not exists submitted_at timestamptz;`.execute(db);
  await sql`alter table league."SeasonTeam" add column if not exists submitted_by_user_id uuid;`.execute(db);
  await sql`alter table league."SeasonTeam" add column if not exists approved_at timestamptz;`.execute(db);
  await sql`alter table league."SeasonTeam" add column if not exists approved_by_user_id uuid;`.execute(db);
  await sql`alter table league."SeasonTeam" add column if not exists rejected_at timestamptz;`.execute(db);
  await sql`alter table league."SeasonTeam" add column if not exists rejected_by_user_id uuid;`.execute(db);
  await sql`alter table league."SeasonTeam" add column if not exists review_notes text;`.execute(db);
  await sql`create index if not exists season_team_review_status_idx on league."SeasonTeam"(season_id, review_status);`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop index if exists league.season_team_review_status_idx;`.execute(db);
  await sql`alter table league."SeasonTeam" drop column if exists review_notes;`.execute(db);
  await sql`alter table league."SeasonTeam" drop column if exists rejected_by_user_id;`.execute(db);
  await sql`alter table league."SeasonTeam" drop column if exists rejected_at;`.execute(db);
  await sql`alter table league."SeasonTeam" drop column if exists approved_by_user_id;`.execute(db);
  await sql`alter table league."SeasonTeam" drop column if exists approved_at;`.execute(db);
  await sql`alter table league."SeasonTeam" drop column if exists submitted_by_user_id;`.execute(db);
  await sql`alter table league."SeasonTeam" drop column if exists submitted_at;`.execute(db);
  await sql`alter table league."SeasonTeam" drop column if exists review_status;`.execute(db);
}
