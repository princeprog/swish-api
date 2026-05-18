import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';

jest.mock('../users/users.service', () => ({
  UsersService: class UsersService {},
}));

import { AuthService } from './auth.service';

describe('AuthService', () => {
  const user = {
    id: 'user-1',
    username: 'league-admin',
    email: 'admin@swish.test',
  };

  const membership = {
    league_id: 12,
    role: 'league_admin',
  };

  function createDb(session: Record<string, any>) {
    return {
      selectFrom: jest.fn((table: string) => {
        const filters: Record<string, any> = {};

        const builder = {
          selectAll: jest.fn(() => builder),
          select: jest.fn(() => builder),
          where: jest.fn((column: string, _operator: string, value: any) => {
            filters[column] = value;
            return builder;
          }),
          executeTakeFirst: jest.fn(async () => {
            if (table === 'auth.sessions') {
              return session.id === filters.id ? session : undefined;
            }

            if (table === 'auth.users') {
              return user.id === filters.id ? user : undefined;
            }

            if (table === 'league.league_members') {
              return user.id === filters.user_id ? membership : undefined;
            }

            return undefined;
          }),
        };

        return builder;
      }),
      updateTable: jest.fn((table: string) => {
        const filters: Record<string, any> = {};
        let updateValues: Record<string, any> = {};

        const builder = {
          set: jest.fn((values: Record<string, any>) => {
            updateValues = values;
            if (table === 'auth.sessions') {
              Object.assign(session, updateValues);
            }
            return builder;
          }),
          where: jest.fn((column: string, _operator: string, value: any) => {
            filters[column] = value;
            return builder;
          }),
          execute: jest.fn(async () => {
            if (table === 'auth.sessions' && (!filters.id || session.id === filters.id)) {
              Object.assign(session, updateValues);
            }
          }),
        };

        return builder;
      }),
    };
  }

  function createResponse() {
    return {
      cookie: jest.fn(),
    };
  }

  function digestRefreshToken(refreshToken: string) {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  async function createSubject() {
    const jwtService = new JwtService({ secret: 'test-secret' });
    const payload = {
      username: user.username,
      sub: user.id,
      session_id: 'session-1',
      role: membership.role,
    };
    const refreshToken = jwtService.sign(payload, { expiresIn: '7d' });
    const session = {
      id: payload.session_id,
      user_id: user.id,
      refresh_token_hash: await bcrypt.hash(digestRefreshToken(refreshToken), 10),
      revoked_at: null,
      last_used_at: new Date('2026-05-18T00:00:00.000Z'),
    };
    const db = createDb(session);
    const service = new AuthService({} as any, jwtService, db as any);

    return { db, jwtService, payload, refreshToken, response: createResponse(), service, session };
  }

  it('rotates the refresh token and updates cookies when a refresh token is used', async () => {
    const { refreshToken, response, service, session } = await createSubject();

    const result = await service.refreshSession(refreshToken, response as any);

    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(result.refreshToken).not.toBe(refreshToken);
    expect(result.user).toEqual({
      id: user.id,
      username: user.username,
      email: user.email,
      role: membership.role,
      league_id: membership.league_id,
      hasLeagueConfigured: true,
    });
    expect(await bcrypt.compare(digestRefreshToken(refreshToken), session.refresh_token_hash)).toBe(false);
    expect(await bcrypt.compare(digestRefreshToken(result.refreshToken), session.refresh_token_hash)).toBe(true);
    expect(session.last_used_at.getTime()).toBeGreaterThan(new Date('2026-05-18T00:00:00.000Z').getTime());
    expect(response.cookie).toHaveBeenCalledWith('access_token', result.accessToken, expect.any(Object));
    expect(response.cookie).toHaveBeenCalledWith('refresh_token', result.refreshToken, expect.any(Object));
  });

  it('rejects a refresh token after it has already been used for rotation', async () => {
    const { refreshToken, response, service } = await createSubject();

    await service.refreshSession(refreshToken, response as any);

    await expect(service.refreshSession(refreshToken, response as any)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
