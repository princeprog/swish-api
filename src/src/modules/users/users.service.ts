import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { DB } from 'src/database/db';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
@Injectable()
export class UsersService {
  constructor(@Inject('KYSELY_DB') private readonly db: Kysely<DB>) { }

  async create(createUserDto: CreateUserDto) {
    const { email, username, full_name, password } = createUserDto;
    const password_hash = await bcrypt.hash(password, 10);
    const resolvedUsername = await this.resolveUsername(username, email, full_name ?? undefined);

    try {
      const user = await this.db
        .insertInto('auth.users')
        .values({
          email,
          username: resolvedUsername,
          full_name: full_name ?? null,
          password_hash,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return user;
    } catch (error: unknown) {
      if (this.isUniqueConstraintViolation(error)) {
        const constraint = error.constraint ?? '';

        if (constraint.includes('users_email_index')) {
          throw new ConflictException('Email already exists');
        }

        if (constraint.includes('users_username_index')) {
          throw new ConflictException('Username already exists');
        }

        throw new ConflictException('Email or username already exists');
      }

      throw error;
    }
  }

  async findOne(username: string) {
    const user = this.db.selectFrom('auth.users').selectAll().where('username', '=', username).executeTakeFirst()
    
    if(!user) {
      throw new Error('User not found');
    }
    return user;
  }

  async findAll() {
    return this.db.selectFrom('auth.users').selectAll().execute();
  }

  async findByEmail(email: string) {
    return this.db.selectFrom('auth.users').selectAll().where('email', '=', email).executeTakeFirst();
  }

  private isUniqueConstraintViolation(
    error: unknown,
  ): error is { code?: string; constraint?: string } {
    if (typeof error !== 'object' || error === null) {
      return false;
    }

    return (
      'code' in error &&
      typeof error.code === 'string' &&
      error.code === '23505'
    );
  }

  private async resolveUsername(
    username: string | undefined,
    email: string,
    fullName?: string,
  ) {
    const base =
      (username && username.trim()) ||
      (fullName && this.slugify(fullName)) ||
      this.slugify(email.split('@')[0] ?? 'user');

    let candidate = base;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const existing = await this.db
        .selectFrom('auth.users')
        .select('id')
        .where('username', '=', candidate)
        .executeTakeFirst();

      if (!existing) {
        return candidate;
      }

      candidate = `${base}-${randomBytes(2).toString('hex')}`;
    }

    return `${base}-${randomBytes(3).toString('hex')}`;
  }

  private slugify(value: string) {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 90);
  }
}
