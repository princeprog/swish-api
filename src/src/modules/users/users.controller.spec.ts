import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuthGuard } from '../auth/auth.guard';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UsersController } from './users.controller';

describe('UsersController RBAC metadata', () => {
  it('requires authentication and admin roles to list users', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, UsersController.prototype.findAll);
    const roles = Reflect.getMetadata(ROLES_KEY, UsersController.prototype.findAll);

    expect(guards).toEqual([AuthGuard, RolesGuard]);
    expect(roles).toEqual(['super_admin', 'league_admin']);
  });

  it('requires authentication and admin roles to create users through the users endpoint', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, UsersController.prototype.create);
    const roles = Reflect.getMetadata(ROLES_KEY, UsersController.prototype.create);

    expect(guards).toEqual([AuthGuard, RolesGuard]);
    expect(roles).toEqual(['super_admin', 'league_admin']);
  });
});
