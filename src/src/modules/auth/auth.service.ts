import { Injectable } from '@nestjs/common';
import { UpdateAuthDto } from './dto/update-auth.dto';
import { UsersService } from '../users/users.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import * as bcrypt from 'bcrypt';
import { DB } from 'src/database/db';
import { Kysely } from 'node_modules/kysely/dist/kysely';
import { Inject } from '@nestjs/common';
import { AuthPayloadDto } from './dto/auth-payload.dto';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

@Injectable()
export class AuthService {

  constructor(private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @Inject('KYSELY_DB') private readonly db: Kysely<DB>
  ) { }

  async create(createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  async validateUser(username: string, password: string) {
    const user = await this.usersService.findOne(username);
    if (user && await bcrypt.compare(password, user.password_hash)) {
      return user;
    }
    throw new Error('Invalid username or password');
  }

  async login(user: any, response?: Response) {

    const refreshTempTokenHash = await bcrypt.hash(`${user.id}-${Date.now()}`, 10);

    const createSession = await this.db
      .insertInto('auth.sessions')
      .values({
        user_id: user.id,
        refresh_token_hash: refreshTempTokenHash,
        last_used_at: new Date(),
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirst();

    if(!createSession) {
      throw new Error('Failed to create session');
    }

    const payload = {
      username: user.username,
      sub: user.id,
      session_id: createSession.id,
      role: user.role
    }

    const {accessToken, refreshToken} = this.generateTokenPair(payload);
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

    await this.db.updateTable('auth.sessions')
      .set({ refresh_token_hash: refreshTokenHash })
      .where('id', '=', createSession.id)
      .execute();

    if (response) {
      this.setAccessTokenCookie(response, accessToken);
      this.setRefreshTokenCookie(response, refreshToken);
    }

    const hasLeagueConfigured = user.role === 'league_admin' ? user.league_id !== null : true;

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        league_id: user.league_id,
        hasLeagueConfigured,
      },
    };
  }

  private setAccessTokenCookie(response: Response, accessToken: string) {
    response.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
      path: '/',
    });
  }

  private setRefreshTokenCookie(response: Response, refreshToken: string) {
    response.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
      path: '/',
    });
  }

  private generateTokenPair(payload: AuthPayloadDto) {
    const accessToken = this.jwtService.sign(payload, { expiresIn: `${ACCESS_TOKEN_TTL_SECONDS}s` });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: `${REFRESH_TOKEN_TTL_SECONDS}s` });
    return { accessToken, refreshToken };
  }

  async getProfile(userId: string) {
    const user = await this.db
      .selectFrom('auth.users')
      .selectAll()
      .where('id', '=', userId as any)
      .executeTakeFirst();

    if (!user) {
      throw new Error('User not found');
    }

    const hasLeagueConfigured = user.role === 'league_admin' ? user.league_id !== null : true;

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      league_id: user.league_id,
      hasLeagueConfigured,
    };
  }
}
