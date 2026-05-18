import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  function createContext(user?: { role?: string }) {
    const handler = () => undefined;
    const request = { user };

    return {
      handler,
      context: {
        getHandler: () => handler,
        getClass: () => class TestController {},
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      } as any,
    };
  }

  it('allows requests when no roles are required', () => {
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);
    const { context } = createContext({ role: 'player' });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows a user with one of the required roles', () => {
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);
    const { context, handler } = createContext({ role: 'league_admin' });
    Reflect.defineMetadata(ROLES_KEY, ['super_admin', 'league_admin'], handler);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects a user without the required role', () => {
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);
    const { context, handler } = createContext({ role: 'scorekeeper' });
    Reflect.defineMetadata(ROLES_KEY, ['super_admin', 'league_admin'], handler);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('stores role metadata through the Roles decorator', () => {
    class TestController {
      @Roles('super_admin', 'league_admin')
      listUsers() {
        return [];
      }
    }

    expect(Reflect.getMetadata(ROLES_KEY, TestController.prototype.listUsers)).toEqual([
      'super_admin',
      'league_admin',
    ]);
  });
});
