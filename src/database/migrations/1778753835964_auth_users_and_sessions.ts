import { sql, type Kysely } from 'kysely';

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.createSchema('auth').ifNotExists().execute();

  await db.schema
    .withSchema('auth')
    .createTable('users')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('email', 'varchar(255)', (col) => col.notNull())
    .addColumn('username', 'varchar(100)', (col) => col.notNull())
    .addColumn('role', 'varchar(50)', (col) => col.notNull())
    .addColumn('password_hash', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .withSchema('auth')
    .createIndex('users_email_index')
    .on('users')
    .column('email')
    .unique()
    .execute();

  await db.schema
    .withSchema('auth')
    .createIndex('users_username_index')
    .on('users')
    .column('username')
    .unique()
    .execute();

  await db.schema
    .withSchema('auth')
    .createIndex('users_role_index')
    .on('users')
    .column('role')
    .execute();

  await db.schema
    .withSchema('auth')
    .createTable('sessions')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('user_id', 'uuid', (col) =>
      col
        .notNull()
        .references('auth.users.id')
        .onDelete('cascade')
        .onUpdate('cascade'),
    )
    .addColumn('refresh_token_hash', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('last_used_at', 'timestamptz')
    .addColumn('revoked_at', 'timestamptz')
    .execute();

  await db.schema
    .withSchema('auth')
    .createIndex('sessions_user_id_index')
    .on('sessions')
    .column('user_id')
    .execute();

  await db.schema
    .withSchema('auth')
    .createIndex('sessions_refresh_token_hash_index')
    .on('sessions')
    .column('refresh_token_hash')
    .unique()
    .execute();
}

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.withSchema('auth').dropTable('sessions').execute();
  await db.schema.withSchema('auth').dropTable('users').execute();
}
