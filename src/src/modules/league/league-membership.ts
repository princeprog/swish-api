import type { Kysely } from 'kysely';
import { DB } from 'src/database/db';

export async function getUserLeagueMembership(db: Kysely<DB>, userId: string) {
  const user = await db
    .selectFrom('auth.users')
    .select(['active_league_id'])
    .where('id', '=', userId as any)
    .executeTakeFirst();

  if (user?.active_league_id) {
    const activeMembership = await db
      .selectFrom('league.league_members')
      .select(['league_id', 'role'])
      .where('user_id', '=', userId as any)
      .where('league_id', '=', user.active_league_id as any)
      .executeTakeFirst();

    if (activeMembership) {
      return activeMembership;
    }
  }

  const fallbackMembership = await db
    .selectFrom('league.league_members')
    .select(['league_id', 'role'])
    .where('user_id', '=', userId as any)
    .orderBy('created_at', 'desc')
    .executeTakeFirst();

  if (fallbackMembership) {
    await db
      .updateTable('auth.users')
      .set({ active_league_id: fallbackMembership.league_id as any })
      .where('id', '=', userId as any)
      .execute();
  }

  return fallbackMembership;
}
