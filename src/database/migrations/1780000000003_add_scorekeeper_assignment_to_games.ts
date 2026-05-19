import type { Kysely } from 'kysely'

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .withSchema('game')
    .alterTable('Game')
    .addColumn('scorekeeper_user_id', 'uuid', (col) =>
      col.references('auth.users.id').onDelete('set null'),
    )
    .execute()

  await db.schema
    .withSchema('game')
    .createIndex('game_game_scorekeeper_user_id_idx')
    .on('Game')
    .column('scorekeeper_user_id')
    .execute()

  await db.schema
    .withSchema('game')
    .createIndex('game_game_scorekeeper_user_id_season_id_idx')
    .on('Game')
    .columns(['scorekeeper_user_id', 'season_id'])
    .execute()
}

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function down(db: Kysely<any>): Promise<void> {
  // Drop the compound index first, then the single-column index, then the column.
  await db.schema
    .withSchema('game')
    .dropIndex('game_game_scorekeeper_user_id_season_id_idx')
    .execute()
  await db.schema
    .withSchema('game')
    .dropIndex('game_game_scorekeeper_user_id_idx')
    .execute()
  await db.schema
    .withSchema('game')
    .alterTable('Game')
    .dropColumn('scorekeeper_user_id')
    .execute()
}
