import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { Inject } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { DB } from 'src/database/db';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @Inject('KYSELY_DB') private readonly db: Kysely<DB>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromRequest(request);

    if (!token) {
      throw new UnauthorizedException('Authentication token not found');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);
      // Assign the user payload to the request object
      request['user'] = payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired authentication token');
    }

    await this.enforceMaintenanceLock(request);
    return true;
  }

  private async enforceMaintenanceLock(request: Request) {
    if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return;

    const userRole = String((request as any).user?.role ?? '').toUpperCase();
    if (userRole === 'SUPER_ADMIN') return;

    const control = await this.db
      .selectFrom('league.instance_controls')
      .select(['maintenance_lock_enabled'])
      .where('id', '=', 'singleton')
      .executeTakeFirst();

    if (control?.maintenance_lock_enabled) {
      throw new ForbiddenException('Maintenance mode is enabled. Mutations are temporarily locked.');
    }
  }

  private extractTokenFromRequest(request: Request): string | undefined {
    // 1. Check Authorization header
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    if (type === 'Bearer' && token) {
      return token;
    }

    // 2. Check HTTP-only cookie
    if (request.cookies && request.cookies['access_token']) {
      return request.cookies['access_token'];
    }

    return undefined;
  }
}
