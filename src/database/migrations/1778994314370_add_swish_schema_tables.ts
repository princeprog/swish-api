import { sql, type Kysely } from 'kysely';

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function up(db: Kysely<any>): Promise<void> {
  // Create custom schemas
  await db.schema.createSchema('league').ifNotExists().execute();
  await db.schema.createSchema('player').ifNotExists().execute();
  await db.schema.createSchema('game').ifNotExists().execute();

  // 1. Table: League
  await db.schema
    .withSchema('league')
    .createTable('League')
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('logo_url', 'varchar(255)', (col) => col.notNull())
    .addColumn('description', 'text', (col) => col.notNull())
    .addColumn('location', 'varchar(255)', (col) => col.notNull())
    .addColumn('contact_info', 'varchar(255)', (col) => col.notNull())
    .addColumn('rules_config', 'jsonb', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // 2. Table: Season
  await db.schema
    .withSchema('league')
    .createTable('Season')
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('league_id', 'integer', (col) =>
      col.notNull().references('league.League.id').onDelete('cascade'),
    )
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('start_date', 'date', (col) => col.notNull())
    .addColumn('end_date', 'date', (col) => col.notNull())
    .addColumn('playoff_format', 'varchar(255)', (col) => col.notNull())
    .addColumn('status', 'bigint', (col) => col.notNull())
    .execute();

  await db.schema
    .withSchema('league')
    .createIndex('season_league_id_index')
    .on('Season')
    .column('league_id')
    .execute();

  // 3. Table: Teams
  await db.schema
    .withSchema('league')
    .createTable('Teams')
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('league_id', 'integer', (col) =>
      col.notNull().references('league.League.id').onDelete('cascade'),
    )
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('abbreviation', 'varchar(255)', (col) => col.notNull())
    .addColumn('primary_color', 'varchar(255)', (col) => col.notNull())
    .addColumn('secondary_color', 'varchar(255)', (col) => col.notNull())
    .addColumn('logo_url', 'varchar(255)', (col) => col.notNull())
    .addColumn('coach_name', 'varchar(255)', (col) => col.notNull())
    .addColumn('user_id', 'uuid', (col) =>
      col.notNull().references('auth.users.id').onDelete('cascade'),
    )
    .execute();

  await db.schema
    .withSchema('league')
    .createIndex('teams_league_id_index')
    .on('Teams')
    .column('league_id')
    .execute();

  await db.schema
    .withSchema('league')
    .createIndex('teams_user_id_index')
    .on('Teams')
    .column('user_id')
    .execute();

  // 4. Table: SeasonTeam (Join table with composite PK)
  await db.schema
    .withSchema('league')
    .createTable('SeasonTeam')
    .addColumn('season_id', 'integer', (col) =>
      col.notNull().references('league.Season.id').onDelete('cascade'),
    )
    .addColumn('team_id', 'integer', (col) =>
      col.notNull().references('league.Teams.id').onDelete('cascade'),
    )
    .addColumn('bracket', 'varchar(255)', (col) => col.notNull())
    .addPrimaryKeyConstraint('season_team_pk', ['season_id', 'team_id'])
    .execute();

  await db.schema
    .withSchema('league')
    .createIndex('season_team_team_id_index')
    .on('SeasonTeam')
    .column('team_id')
    .execute();

  // 5. Table: Player
  await db.schema
    .withSchema('player')
    .createTable('Player')
    .addColumn('id', 'bigserial', (col) => col.primaryKey())
    .addColumn('full_name', 'varchar(255)', (col) => col.notNull())
    .addColumn('date_of_birth', 'date', (col) => col.notNull())
    .addColumn('height_cm', 'integer', (col) => col.notNull())
    .addColumn('weight_kg', 'integer', (col) => col.notNull())
    .addColumn('position', 'varchar(255)', (col) => col.notNull())
    .addColumn('photo_url', 'varchar(255)', (col) => col.notNull())
    .execute();

  // 6. Table: Roster
  await db.schema
    .withSchema('player')
    .createTable('Roster')
    .addColumn('id', 'bigserial', (col) => col.primaryKey())
    .addColumn('season_id', 'integer', (col) =>
      col.notNull().references('league.Season.id').onDelete('cascade'),
    )
    .addColumn('team_id', 'integer', (col) =>
      col.notNull().references('league.Teams.id').onDelete('cascade'),
    )
    .addColumn('player_id', 'bigint', (col) =>
      col.notNull().references('player.Player.id').onDelete('cascade'),
    )
    .addColumn('jersey_number', 'integer', (col) => col.notNull())
    .addColumn('status', 'varchar(255)', (col) => col.notNull())
    .addColumn('joined_date', 'date', (col) => col.notNull())
    .execute();

  await db.schema
    .withSchema('player')
    .createIndex('roster_season_id_index')
    .on('Roster')
    .column('season_id')
    .execute();

  await db.schema
    .withSchema('player')
    .createIndex('roster_team_id_index')
    .on('Roster')
    .column('team_id')
    .execute();

  await db.schema
    .withSchema('player')
    .createIndex('roster_player_id_index')
    .on('Roster')
    .column('player_id')
    .execute();

  // 7. Table: Game
  await db.schema
    .withSchema('game')
    .createTable('Game')
    .addColumn('id', 'bigserial', (col) => col.primaryKey())
    .addColumn('season_id', 'integer', (col) =>
      col.notNull().references('league.Season.id').onDelete('cascade'),
    )
    .addColumn('home_team', 'integer', (col) =>
      col.notNull().references('league.Teams.id').onDelete('cascade'),
    )
    .addColumn('away_team', 'integer', (col) =>
      col.notNull().references('league.Teams.id').onDelete('cascade'),
    )
    .addColumn('scheduled_at', 'timestamptz', (col) => col.notNull())
    .addColumn('venue', 'varchar(255)', (col) => col.notNull())
    .addColumn('game_type', 'varchar(255)', (col) => col.notNull())
    .addColumn('status', 'bigint', (col) => col.notNull())
    .addColumn('home_score', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('away_score', 'integer', (col) => col.notNull().defaultTo(0))
    .execute();

  await db.schema
    .withSchema('game')
    .createIndex('game_season_id_index')
    .on('Game')
    .column('season_id')
    .execute();

  await db.schema
    .withSchema('game')
    .createIndex('game_home_team_index')
    .on('Game')
    .column('home_team')
    .execute();

  await db.schema
    .withSchema('game')
    .createIndex('game_away_team_index')
    .on('Game')
    .column('away_team')
    .execute();

  // 8. Table: Award
  await db.schema
    .withSchema('game')
    .createTable('Award')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('season_id', 'integer', (col) =>
      col.notNull().references('league.Season.id').onDelete('cascade'),
    )
    .addColumn('game_id', 'bigint', (col) =>
      col.notNull().references('game.Game.id').onDelete('cascade'),
    )
    .addColumn('player_id', 'bigint', (col) =>
      col.notNull().references('player.Player.id').onDelete('cascade'),
    )
    .addColumn('award_type', 'varchar(255)', (col) => col.notNull())
    .addColumn('description', 'text', (col) => col.notNull())
    .addColumn('awarded_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .withSchema('game')
    .createIndex('award_season_id_index')
    .on('Award')
    .column('season_id')
    .execute();

  await db.schema
    .withSchema('game')
    .createIndex('award_game_id_index')
    .on('Award')
    .column('game_id')
    .execute();

  await db.schema
    .withSchema('game')
    .createIndex('award_player_id_index')
    .on('Award')
    .column('player_id')
    .execute();

  // 9. Table: GameEvent
  await db.schema
    .withSchema('game')
    .createTable('GameEvent')
    .addColumn('id', 'bigserial', (col) => col.primaryKey())
    .addColumn('game_id', 'bigint', (col) =>
      col.notNull().references('game.Game.id').onDelete('cascade'),
    )
    .addColumn('team_id', 'integer', (col) =>
      col.notNull().references('league.Teams.id').onDelete('cascade'),
    )
    .addColumn('player_id', 'bigint', (col) =>
      col.notNull().references('player.Player.id').onDelete('cascade'),
    )
    .addColumn('event_type', 'varchar(255)', (col) => col.notNull())
    .addColumn('period', 'integer', (col) => col.notNull())
    .addColumn('clock_time', 'varchar(255)', (col) => col.notNull())
    .addColumn('event_value', 'integer', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .withSchema('game')
    .createIndex('gameevent_game_id_index')
    .on('GameEvent')
    .column('game_id')
    .execute();

  await db.schema
    .withSchema('game')
    .createIndex('gameevent_team_id_index')
    .on('GameEvent')
    .column('team_id')
    .execute();

  await db.schema
    .withSchema('game')
    .createIndex('gameevent_player_id_index')
    .on('GameEvent')
    .column('player_id')
    .execute();

  // 10. Table: GameSummary
  await db.schema
    .withSchema('game')
    .createTable('GameSummary')
    .addColumn('id', 'bigserial', (col) => col.primaryKey())
    .addColumn('game_id', 'bigint', (col) =>
      col.notNull().references('game.Game.id').onDelete('cascade'),
    )
    .addColumn('narrative', 'text', (col) => col.notNull())
    .addColumn('highlights', 'text', (col) => col.notNull())
    .addColumn('published_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .withSchema('game')
    .createIndex('gamesummary_game_id_index')
    .on('GameSummary')
    .column('game_id')
    .execute();

  // 11. Table: GameStats
  await db.schema
    .withSchema('game')
    .createTable('GameStats')
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('game_id', 'bigint', (col) =>
      col.notNull().references('game.Game.id').onDelete('cascade'),
    )
    .addColumn('player_id', 'bigint', (col) =>
      col.notNull().references('player.Player.id').onDelete('cascade'),
    )
    .addColumn('team_id', 'integer', (col) =>
      col.notNull().references('league.Teams.id').onDelete('cascade'),
    )
    .addColumn('minutes_played', 'integer', (col) => col.notNull())
    .addColumn('points', 'integer', (col) => col.notNull())
    .addColumn('fgm_fga', 'varchar(255)', (col) => col.notNull())
    .addColumn('tpm_tpa', 'varchar(255)', (col) => col.notNull())
    .addColumn('ftm_fta', 'varchar(255)', (col) => col.notNull())
    .addColumn('rebounds', 'integer', (col) => col.notNull())
    .addColumn('assists', 'integer', (col) => col.notNull())
    .addColumn('steal', 'integer', (col) => col.notNull())
    .addColumn('blocks', 'integer', (col) => col.notNull())
    .addColumn('personal_fouls', 'integer', (col) => col.notNull())
    .execute();

  await db.schema
    .withSchema('game')
    .createIndex('gamestats_game_id_index')
    .on('GameStats')
    .column('game_id')
    .execute();

  await db.schema
    .withSchema('game')
    .createIndex('gamestats_player_id_index')
    .on('GameStats')
    .column('player_id')
    .execute();

  await db.schema
    .withSchema('game')
    .createIndex('gamestats_team_id_index')
    .on('GameStats')
    .column('team_id')
    .execute();

  // 12. Modify auth.users table (add new columns)
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

  // Add indexes for the new users columns
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
}

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function down(db: Kysely<any>): Promise<void> {
  // 1. Remove users indexes
  await db.schema
    .withSchema('auth')
    .dropIndex('users_player_id_index')
    .ifExists()
    .execute();
  await db.schema
    .withSchema('auth')
    .dropIndex('users_team_id_index')
    .ifExists()
    .execute();
  await db.schema
    .withSchema('auth')
    .dropIndex('users_league_id_index')
    .ifExists()
    .execute();

  // 2. Remove columns from auth.users table
  await db.schema
    .withSchema('auth')
    .alterTable('users')
    .dropColumn('player_id')
    .execute();
  await db.schema
    .withSchema('auth')
    .alterTable('users')
    .dropColumn('team_id')
    .execute();
  await db.schema
    .withSchema('auth')
    .alterTable('users')
    .dropColumn('league_id')
    .execute();

  // 3. Drop all new tables in correct reverse dependency order
  await db.schema
    .withSchema('game')
    .dropTable('GameStats')
    .ifExists()
    .execute();
  await db.schema
    .withSchema('game')
    .dropTable('GameSummary')
    .ifExists()
    .execute();
  await db.schema
    .withSchema('game')
    .dropTable('GameEvent')
    .ifExists()
    .execute();
  await db.schema
    .withSchema('game')
    .dropTable('Award')
    .ifExists()
    .execute();
  await db.schema
    .withSchema('game')
    .dropTable('Game')
    .ifExists()
    .execute();
  await db.schema
    .withSchema('player')
    .dropTable('Roster')
    .ifExists()
    .execute();
  await db.schema
    .withSchema('player')
    .dropTable('Player')
    .ifExists()
    .execute();
  await db.schema
    .withSchema('league')
    .dropTable('SeasonTeam')
    .ifExists()
    .execute();
  await db.schema
    .withSchema('league')
    .dropTable('Teams')
    .ifExists()
    .execute();
  await db.schema
    .withSchema('league')
    .dropTable('Season')
    .ifExists()
    .execute();
  await db.schema
    .withSchema('league')
    .dropTable('League')
    .ifExists()
    .execute();

  // 4. Drop custom schemas
  await db.schema.dropSchema('game').ifExists().execute();
  await db.schema.dropSchema('player').ifExists().execute();
  await db.schema.dropSchema('league').ifExists().execute();
}
