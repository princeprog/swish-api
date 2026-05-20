import 'dotenv/config';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import type { DB } from '../database/db';

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL ?? 'superadmin@swish.local';
  const username = process.env.SUPER_ADMIN_USERNAME ?? 'superadmin';
  const fullName = process.env.SUPER_ADMIN_FULL_NAME ?? 'Swish Super Admin';
  const password = process.env.SUPER_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const role = 'SUPER_ADMIN';

  const db = new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new Pool({
        host: requiredEnv('DB_HOST'),
        port: parseInt(requiredEnv('DB_PORT'), 10),
        user: requiredEnv('DB_USER'),
        password: requiredEnv('DB_PASSWORD'),
        database: requiredEnv('DB_NAME'),
      }),
    }),
  });

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await db
      .selectFrom('auth.users')
      .selectAll()
      .where(sql<string>`lower(email)`, '=', normalizedEmail)
      .executeTakeFirst();

    const user =
      existingUser ??
      (await db
        .insertInto('auth.users')
        .values({
          email: normalizedEmail,
          username: await resolveUniqueUsername(db, username),
          full_name: fullName,
          password_hash: await bcrypt.hash(password, 10),
        })
        .returningAll()
        .executeTakeFirstOrThrow());

    let league = await db
      .selectFrom('league.League')
      .selectAll()
      .orderBy('id', 'asc')
      .executeTakeFirst();

    if (!league) {
      league = await db
        .insertInto('league.League')
        .values({
          name: 'Swish Admin League',
          logo_url: '',
          description: '',
          location: '',
          contact_info: '',
          rules_config: sql`'{}'::jsonb` as any,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    }

    await db
      .insertInto('league.league_members')
      .values({
        id: randomBytes(16).toString('hex'),
        league_id: league.id,
        user_id: user.id,
        role,
      })
      .onConflict((oc) => oc.column('user_id').doUpdateSet({ role }))
      .execute();

    console.log('Super admin ready:');
    console.log(`email=${normalizedEmail}`);
    console.log(`username=${user.username}`);
    console.log(`role=${role}`);
    if (!existingUser) {
      console.log(`temporary_password=${password}`);
    } else {
      console.log('temporary_password=(unchanged existing user password)');
    }
  } finally {
    await db.destroy();
  }
}

async function resolveUniqueUsername(db: Kysely<DB>, preferredUsername: string) {
  const base = preferredUsername.trim().toLowerCase() || 'superadmin';
  let candidate = base;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const existing = await db
      .selectFrom('auth.users')
      .select('id')
      .where('username', '=', candidate)
      .executeTakeFirst();

    if (!existing) return candidate;
    candidate = `${base}-${randomBytes(2).toString('hex')}`;
  }

  return `${base}-${randomBytes(3).toString('hex')}`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
