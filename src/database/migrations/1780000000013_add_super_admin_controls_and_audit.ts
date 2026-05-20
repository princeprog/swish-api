import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('league.instance_controls')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('maintenance_lock_enabled', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('maintenance_lock_reason', 'text')
    .addColumn('maintenance_lock_updated_by', 'text')
    .addColumn('maintenance_lock_updated_at', 'timestamptz')
    .execute();

  await db
    .insertInto('league.instance_controls')
    .values({ id: 'singleton', maintenance_lock_enabled: false })
    .execute();

  await db.schema
    .createTable('league.super_admin_audit_log')
    .addColumn('id', 'bigserial', (col) => col.primaryKey())
    .addColumn('actor_user_id', 'text', (col) => col.notNull())
    .addColumn('action_type', 'text', (col) => col.notNull())
    .addColumn('target_type', 'text', (col) => col.notNull())
    .addColumn('target_id', 'text')
    .addColumn('before_snapshot', 'jsonb')
    .addColumn('after_snapshot', 'jsonb')
    .addColumn('reason', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('super_admin_audit_log_action_type_idx')
    .on('league.super_admin_audit_log')
    .column('action_type')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('super_admin_audit_log_action_type_idx').execute();
  await db.schema.dropTable('league.super_admin_audit_log').execute();
  await db.schema.dropTable('league.instance_controls').execute();
}
