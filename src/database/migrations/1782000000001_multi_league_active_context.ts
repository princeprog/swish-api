import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .withSchema('auth')
    .alterTable('users')
    .addColumn('active_league_id', 'integer')
    .execute();

  await db.schema
    .withSchema('auth')
    .createIndex('users_active_league_id_index')
    .on('users')
    .column('active_league_id')
    .execute();

  await db.schema
    .withSchema('league')
    .dropIndex('league_members_user_id_unique')
    .ifExists()
    .execute();

  await db.schema
    .withSchema('league')
    .createIndex('league_members_league_user_unique')
    .on('league_members')
    .columns(['league_id', 'user_id'])
    .unique()
    .execute();

  await sql`
    update auth.users u
    set active_league_id = m.league_id
    from (
      select distinct on (user_id) user_id, league_id
      from league.league_members
      order by user_id, created_at desc
    ) m
    where m.user_id = u.id
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .withSchema('league')
    .dropIndex('league_members_league_user_unique')
    .ifExists()
    .execute();

  await db.schema
    .withSchema('league')
    .createIndex('league_members_user_id_unique')
    .on('league_members')
    .column('user_id')
    .unique()
    .execute();

  await db.schema
    .withSchema('auth')
    .dropIndex('users_active_league_id_index')
    .ifExists()
    .execute();

  await db.schema
    .withSchema('auth')
    .alterTable('users')
    .dropColumn('active_league_id')
    .execute();
}
