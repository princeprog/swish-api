import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .withSchema('league')
    .alterTable('SeasonTeam')
    .addColumn('review_status', 'varchar(32)', (col) => col.notNull().defaultTo('draft'))
    .addColumn('submitted_at', 'timestamptz')
    .addColumn('submitted_by_user_id', 'uuid')
    .addColumn('approved_at', 'timestamptz')
    .addColumn('approved_by_user_id', 'uuid')
    .addColumn('rejected_at', 'timestamptz')
    .addColumn('rejected_by_user_id', 'uuid')
    .addColumn('review_notes', 'text')
    .execute();

  await db.schema
    .withSchema('league')
    .createIndex('season_team_review_status_idx')
    .on('SeasonTeam')
    .columns(['season_id', 'review_status'])
    .execute();

  await sql`
    update league."SeasonTeam"
    set review_status = 'approved'
    where is_finalized = true
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.withSchema('league').dropIndex('season_team_review_status_idx').ifExists().execute();
  await db.schema
    .withSchema('league')
    .alterTable('SeasonTeam')
    .dropColumn('review_notes')
    .dropColumn('rejected_by_user_id')
    .dropColumn('rejected_at')
    .dropColumn('approved_by_user_id')
    .dropColumn('approved_at')
    .dropColumn('submitted_by_user_id')
    .dropColumn('submitted_at')
    .dropColumn('review_status')
    .execute();
}
