import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

export const AUTH_ROLES = [
  'super_admin',
  'league_admin',
  'scorekeeper',
  'team_manager',
  'player',
  'public_viewer',
  'user',
] as const;

export type AuthRole = (typeof AUTH_ROLES)[number];

export const Roles = (...roles: AuthRole[]) => SetMetadata(ROLES_KEY, roles);
