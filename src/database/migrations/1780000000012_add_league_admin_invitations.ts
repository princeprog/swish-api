import { sql, type Kysely } from 'kysely'

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .withSchema('league')
    .createTable('league_admin_invitations')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('email', 'varchar(255)', (col) => col.notNull())
    .addColumn('token_hash', 'text', (col) => col.notNull())
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('accepted_at', 'timestamptz')
    .addColumn('revoked_at', 'timestamptz')
    .addColumn('created_by_user_id', 'uuid', (col) => col.references('auth.users.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .withSchema('league')
    .createIndex('league_admin_invitations_email_index')
    .on('league_admin_invitations')
    .column('email')
    .execute()

  await db.schema
    .withSchema('league')
    .createIndex('league_admin_invitations_token_hash_unique')
    .on('league_admin_invitations')
    .column('token_hash')
    .unique()
    .execute()
}

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.withSchema('league').dropTable('league_admin_invitations').ifExists().execute()
}

