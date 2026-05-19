import { type Kysely } from 'kysely';

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function up(db: Kysely<any>): Promise<void> {
  // Enforce "one team per team manager" at the DB level (per league).
  await db.schema
    .withSchema('league')
    .createIndex('team_manager_teams_league_user_unique')
    .on('team_manager_teams')
    .columns(['league_id', 'user_id'])
    .unique()
    .execute();
}

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .withSchema('league')
    .dropIndex('team_manager_teams_league_user_unique')
    .ifExists()
    .execute();
}

