import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { DB } from 'src/database/db';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';
@Injectable()
export class UsersService {
  constructor(@Inject('KYSELY_DB') private readonly db: Kysely<DB>) { }

  async create(createUserDto: CreateUserDto) {
    const { email, username, password } = createUserDto;
    const password_hash = await bcrypt.hash(password, 10);

    try {
      const user = await this.db
        .insertInto('auth.users')
        .values({
          email,
          username,
          password_hash,
          role: 'user',
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
}
