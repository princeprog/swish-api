import { BadRequestException, Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { UpdateAuthDto } from './dto/update-auth.dto';
import { UsersService } from '../users/users.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import * as bcrypt from 'bcrypt';
import { DB } from 'src/database/db';
import { sql, type Kysely } from 'kysely';
import { AuthPayloadDto } from './dto/auth-payload.dto';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { getUserLeagueMembership } from '../league/league-membership';
import { CreateAccountFromInviteDto } from './dto/create-account-from-invite.dto';
import { createHash, randomUUID } from 'crypto';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

@Injectable()
export class AuthService {

  constructor(private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @Inject('KYSELY_DB') private readonly db: Kysely<DB>,
  ) { }

  async create(createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  async createAccountFromInvite(dto: CreateAccountFromInviteDto, response?: Response) {
    const payload = this.jwtService.verify(dto.invite) as
      | { purpose: 'invite-setup'; inviteId: string; email: string }
      | { purpose: 'league-admin-invite-setup'; inviteId: string; email: string };

    const normalizedEmail = payload.email.trim().toLowerCase();

    if (payload.purpose === 'invite-setup') {
      const invite = await this.db
        .selectFrom('league.league_invitations')
        .selectAll()
        .where('id', '=', payload.inviteId)
        .where(sql<string>`lower(email)`, '=', normalizedEmail)
        .executeTakeFirst();

      if (!invite) throw new BadRequestException('Invitation not found.');
      if (invite.accepted_at) throw new BadRequestException('This invitation has already been used.');
      if (invite.revoked_at) throw new BadRequestException('This invitation has been revoked.');
      if (invite.expires_at.getTime() <= Date.now()) throw new BadRequestException('This invitation has expired.');

      const user = await this.usersService.create({
        email: invite.email.trim().toLowerCase(),
        full_name: dto.full_name,
        password: dto.password,
      });

      await this.db.transaction().execute(async (trx) => {
        await trx
          .insertInto('league.league_members')
          .values({ league_id: invite.league_id, user_id: user.id, role: invite.role })
          .onConflict((oc) => oc.columns(['league_id', 'user_id']).doNothing())
          .execute();

        await trx
          .updateTable('auth.users')
          .set({ active_league_id: invite.league_id as any })
          .where('id', '=', user.id)
          .execute();

        await trx.updateTable('league.league_invitations').set({ accepted_at: new Date() }).where('id', '=', invite.id).execute();
      });

      return this.login(user, response);
    }

    if (payload.purpose === 'league-admin-invite-setup') {
      const invite = await this.db
        .selectFrom('league.league_admin_invitations')
        .selectAll()
        .where('id', '=', payload.inviteId)
        .where(sql<string>`lower(email)`, '=', normalizedEmail)
        .executeTakeFirst();

      if (!invite) throw new BadRequestException('Invitation not found.');
      if ((invite as any).accepted_at) throw new BadRequestException('This invitation has already been used.');
      if ((invite as any).revoked_at) throw new BadRequestException('This invitation has been revoked.');
      if ((invite as any).expires_at.getTime() <= Date.now()) throw new BadRequestException('This invitation has expired.');

      const user = await this.usersService.create({
        email: normalizedEmail,
        full_name: dto.full_name,
        password: dto.password,
      });

      await this.db.transaction().execute(async (trx) => {
        const createdLeague = await trx
          .insertInto('league.League')
          .values({
            name: 'New League',
            logo_url: '',
            description: '',
            location: '',
            contact_info: '',
            rules_config: sql`'{}'::jsonb` as any,
          })
          .returningAll()
          .executeTakeFirstOrThrow();

        await trx.insertInto('league.league_members').values({ league_id: createdLeague.id, user_id: user.id, role: 'league_admin' }).execute();
        await trx.updateTable('auth.users').set({ active_league_id: createdLeague.id as any }).where('id', '=', user.id).execute();

        await trx
          .updateTable('league.league_admin_invitations')
          .set({ accepted_at: new Date() })
          .where('id', '=', (invite as any).id)
          .execute();
      });

      return this.login(user, response);
    }

    throw new BadRequestException('Invalid invitation session token.');
  }

  async validateUser(username: string, password: string) {
    const user = await this.usersService.findOne(username);
    if (user && await bcrypt.compare(password, user.password_hash)) {
      return user;
    }
    throw new Error('Invalid username or password');
  }

  async login(user: any, response?: Response) {
    await this.ensureActiveLeagueContext(user.id);
    const membership = await getUserLeagueMembership(this.db, user.id);
    const role = membership?.role ?? 'user';
    const leagueId = membership?.league_id ?? null;

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
      role,
    }

    const {accessToken, refreshToken} = this.generateTokenPair(payload);
    const refreshTokenHash = await this.hashRefreshToken(refreshToken);

    await this.db.updateTable('auth.sessions')
      .set({ refresh_token_hash: refreshTokenHash })
      .where('id', '=', createSession.id)
      .execute();

    if (response) {
      this.setAccessTokenCookie(response, accessToken);
      this.setRefreshTokenCookie(response, refreshToken);
    }

    let hasLeagueConfigured = false;
    if (membership && leagueId) {
      const league = await this.db
        .selectFrom('league.League')
        .select(['name', 'description', 'location', 'contact_info', 'rules_config'])
        .where('id', '=', leagueId)
        .executeTakeFirst();
      const nameOk = Boolean(league?.name && String(league.name).trim() && String(league.name).trim() !== 'New League');
      const basicsOk = Boolean(
        league?.description && String(league.description).trim() &&
        league?.location && String(league.location).trim() &&
        league?.contact_info && String(league.contact_info).trim(),
      );
      const rulesOk = Boolean(league?.rules_config && Object.keys((league.rules_config as any) ?? {}).length > 0);
      hasLeagueConfigured = nameOk && basicsOk && rulesOk;
    }

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        role,
        league_id: leagueId,
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
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: `${ACCESS_TOKEN_TTL_SECONDS}s`,
      jwtid: randomUUID(),
    });
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: `${REFRESH_TOKEN_TTL_SECONDS}s`,
      jwtid: randomUUID(),
    });
    return { accessToken, refreshToken };
  }

  async refreshSession(refreshToken: string, response?: Response) {
    let payload: AuthPayloadDto;

    try {
      payload = await this.jwtService.verifyAsync<AuthPayloadDto>(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const session = await this.db
      .selectFrom('auth.sessions')
      .selectAll()
      .where('id', '=', payload.session_id)
      .executeTakeFirst();

    if (!session || session.revoked_at || session.user_id !== payload.sub) {
      throw new UnauthorizedException('Invalid refresh session');
    }

    const isCurrentRefreshToken = await this.compareRefreshToken(
      refreshToken,
      session.refresh_token_hash,
    );

    if (!isCurrentRefreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const profile = await this.getProfile(session.user_id);
    const tokenPayload = {
      username: profile.username,
      sub: profile.id,
      session_id: session.id,
      role: profile.role,
    };
    const tokenPair = this.generateTokenPair(tokenPayload);
    const refreshTokenHash = await this.hashRefreshToken(tokenPair.refreshToken);

    await this.db
      .updateTable('auth.sessions')
      .set({
        refresh_token_hash: refreshTokenHash,
        last_used_at: new Date(),
      })
      .where('id', '=', session.id)
      .execute();

    if (response) {
      this.setAccessTokenCookie(response, tokenPair.accessToken);
      this.setRefreshTokenCookie(response, tokenPair.refreshToken);
    }

    return {
      ...tokenPair,
      user: profile,
    };
  }

  async getProfile(userId: string) {
    await this.ensureActiveLeagueContext(userId);
    const user = await this.db
      .selectFrom('auth.users')
      .selectAll()
      .where('id', '=', userId as any)
      .executeTakeFirst();

    if (!user) {
      throw new Error('User not found');
    }

    const membership = await getUserLeagueMembership(this.db, user.id);
    const role = membership?.role ?? 'user';
    const leagueId = membership?.league_id ?? null;

    let hasLeagueConfigured = false;
    if (membership && leagueId) {
      const league = await this.db
        .selectFrom('league.League')
        .select(['name', 'description', 'location', 'contact_info', 'rules_config'])
        .where('id', '=', leagueId)
        .executeTakeFirst();
      const nameOk = Boolean(league?.name && String(league.name).trim() && String(league.name).trim() !== 'New League');
      const basicsOk = Boolean(
        league?.description && String(league.description).trim() &&
        league?.location && String(league.location).trim() &&
        league?.contact_info && String(league.contact_info).trim(),
      );
      const rulesOk = Boolean(league?.rules_config && Object.keys((league.rules_config as any) ?? {}).length > 0);
      hasLeagueConfigured = nameOk && basicsOk && rulesOk;
    }

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role,
      league_id: leagueId,
      hasLeagueConfigured,
    };
  }

  async listLeagueContexts(userId: string) {
    const memberships = await this.db
      .selectFrom('league.league_members as lm')
      .innerJoin('league.League as l', 'l.id', 'lm.league_id')
      .select(['lm.league_id as league_id', 'lm.role as role', 'l.name as league_name', 'lm.created_at as joined_at'])
      .where('lm.user_id', '=', userId as any)
      .orderBy('lm.created_at', 'desc')
      .execute();

    const user = await this.db
      .selectFrom('auth.users')
      .select(['active_league_id'])
      .where('id', '=', userId as any)
      .executeTakeFirst();

    return {
      active_league_id: user?.active_league_id ?? null,
      memberships: memberships.map((m) => ({
        league_id: Number(m.league_id),
        league_name: m.league_name,
        role: m.role,
        joined_at: m.joined_at,
      })),
    };
  }

  async setActiveLeague(userId: string, leagueId: number) {
    const membership = await this.db
      .selectFrom('league.league_members')
      .select(['league_id'])
      .where('user_id', '=', userId as any)
      .where('league_id', '=', leagueId as any)
      .executeTakeFirst();

    if (!membership) {
      throw new UnauthorizedException('You are not a member of this league.');
    }

    await this.db
      .updateTable('auth.users')
      .set({ active_league_id: leagueId as any })
      .where('id', '=', userId as any)
      .execute();

    return this.getProfile(userId);
  }

  private async ensureActiveLeagueContext(userId: string) {
    const user = await this.db
      .selectFrom('auth.users')
      .select(['active_league_id'])
      .where('id', '=', userId as any)
      .executeTakeFirst();

    if (!user) return;

    if (user.active_league_id) {
      const hasMembership = await this.db
        .selectFrom('league.league_members')
        .select(['league_id'])
        .where('user_id', '=', userId as any)
        .where('league_id', '=', user.active_league_id as any)
        .executeTakeFirst();
      if (hasMembership) return;
    }

    const fallback = await this.db
      .selectFrom('league.league_members')
      .select(['league_id'])
      .where('user_id', '=', userId as any)
      .orderBy('created_at', 'desc')
      .executeTakeFirst();

    await this.db
      .updateTable('auth.users')
      .set({ active_league_id: fallback?.league_id ?? null as any })
      .where('id', '=', userId as any)
      .execute();
  }

  private async hashRefreshToken(refreshToken: string) {
    return bcrypt.hash(this.digestRefreshToken(refreshToken), 10);
  }

  private async compareRefreshToken(refreshToken: string, refreshTokenHash: string) {
    return bcrypt.compare(this.digestRefreshToken(refreshToken), refreshTokenHash);
  }

  private digestRefreshToken(refreshToken: string) {
    return createHash('sha256').update(refreshToken).digest('hex');
  }
}
