import { sql, type Kysely } from 'kysely'

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function up(db: Kysely<any>): Promise<void> {
  // Attachments + structured metadata for compliance status (e.g., receipts).
  await db.schema
    .withSchema('league')
    .alterTable('team_compliance_status')
    .addColumn('attachments', 'jsonb', (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn('meta', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .execute()
}

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .withSchema('league')
    .alterTable('team_compliance_status')
    .dropColumn('attachments')
    .dropColumn('meta')
    .execute()
}
