import type { Kysely } from 'kysely';
import { DB } from 'src/database/db';

export async function getUserLeagueMembership(db: Kysely<DB>, userId: string) {
  return db
    .selectFrom('league.league_members')
    .select(['league_id', 'role'])
    .where('user_id', '=', userId as any)
    .executeTakeFirst();
}
