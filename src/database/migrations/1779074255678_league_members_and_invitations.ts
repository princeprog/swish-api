import { sql, type Kysely } from 'kysely';

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .withSchema('league')
    .createTable('league_members')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('league_id', 'integer', (col) =>
      col.notNull().references('league.League.id').onDelete('cascade'),
    )
    .addColumn('user_id', 'uuid', (col) =>
      col.notNull().references('auth.users.id').onDelete('cascade'),
    )
    .addColumn('role', 'varchar(50)', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .withSchema('league')
    .createIndex('league_members_league_id_index')
    .on('league_members')
    .column('league_id')
    .execute();

  await db.schema
    .withSchema('league')
    .createIndex('league_members_user_id_unique')
    .on('league_members')
    .column('user_id')
    .unique()
    .execute();

  await db.schema
    .withSchema('league')
    .createTable('league_invitations')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('league_id', 'integer', (col) =>
      col.notNull().references('league.League.id').onDelete('cascade'),
    )
    .addColumn('email', 'varchar(255)', (col) => col.notNull())
    .addColumn('role', 'varchar(50)', (col) => col.notNull())
    .addColumn('token_hash', 'text', (col) => col.notNull())
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('accepted_at', 'timestamptz')
    .addColumn('revoked_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .withSchema('league')
    .createIndex('league_invitations_league_id_index')
    .on('league_invitations')
    .column('league_id')
    .execute();

  await db.schema
    .withSchema('league')
    .createIndex('league_invitations_email_index')
    .on('league_invitations')
    .column('email')
    .execute();

  await db.schema
    .withSchema('league')
    .createIndex('league_invitations_token_hash_unique')
    .on('league_invitations')
    .column('token_hash')
    .unique()
    .execute();

  await sql`
    INSERT INTO league.league_members (league_id, user_id, role, created_at)
    SELECT league_id, id, role, now()
    FROM auth.users
    WHERE league_id IS NOT NULL
  `.execute(db);

  await db.schema
    .withSchema('auth')
    .dropIndex('users_role_index')
    .ifExists()
    .execute();

  await db.schema
    .withSchema('auth')
    .dropIndex('users_league_id_index')
    .ifExists()
    .execute();

  await db.schema
    .withSchema('auth')
    .dropIndex('users_team_id_index')
    .ifExists()
    .execute();

  await db.schema
    .withSchema('auth')
    .dropIndex('users_player_id_index')
    .ifExists()
    .execute();

  await db.schema
    .withSchema('auth')
    .alterTable('users')
    .dropColumn('role')
    .execute();

  await db.schema
    .withSchema('auth')
    .alterTable('users')
    .dropColumn('league_id')
    .execute();

  await db.schema
    .withSchema('auth')
    .alterTable('users')
    .dropColumn('team_id')
    .execute();

  await db.schema
    .withSchema('auth')
    .alterTable('users')
    .dropColumn('player_id')
    .execute();
}

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .withSchema('auth')
    .alterTable('users')
    .addColumn('role', 'varchar(50)', (col) =>
      col.notNull().defaultTo('user'),
    )
    .execute();

  await db.schema
    .withSchema('auth')
    .alterTable('users')
    .addColumn('league_id', 'integer', (col) =>
      col.references('league.League.id').onDelete('set null'),
    )
    .execute();

  await db.schema
    .withSchema('auth')
    .alterTable('users')
    .addColumn('team_id', 'integer', (col) =>
      col.references('league.Teams.id').onDelete('set null'),
    )
    .execute();

  await db.schema
    .withSchema('auth')
    .alterTable('users')
    .addColumn('player_id', 'bigint', (col) =>
      col.references('player.Player.id').onDelete('set null'),
    )
    .execute();

  await sql`
    UPDATE auth.users AS u
    SET league_id = m.league_id,
        role = m.role
    FROM (
      SELECT DISTINCT ON (user_id) user_id, league_id, role
      FROM league.league_members
      ORDER BY user_id, created_at ASC
    ) AS m
    WHERE u.id = m.user_id
  `.execute(db);

  await db.schema
    .withSchema('auth')
    .createIndex('users_role_index')
    .on('users')
    .column('role')
    .execute();

  await db.schema
    .withSchema('auth')
    .createIndex('users_league_id_index')
    .on('users')
    .column('league_id')
    .execute();

  await db.schema
    .withSchema('auth')
    .createIndex('users_team_id_index')
    .on('users')
    .column('team_id')
    .execute();

  await db.schema
    .withSchema('auth')
    .createIndex('users_player_id_index')
    .on('users')
    .column('player_id')
    .execute();

  await db.schema
    .withSchema('league')
    .dropTable('league_invitations')
    .ifExists()
    .execute();

  await db.schema
    .withSchema('league')
    .dropTable('league_members')
    .ifExists()
    .execute();
}
