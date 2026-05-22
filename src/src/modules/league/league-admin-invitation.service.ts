import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { createHash, randomBytes } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { sql } from 'kysely';
import { DB } from 'src/database/db';
import { UsersService } from '../users/users.service';
import { InvitationEmailService } from './invitation-email.service';
import { getUserLeagueMembership } from './league-membership';
import { CreateLeagueAdminInviteDto } from './dto/create-league-admin-invite.dto';

type AdminInviteRecord = {
  id: string;
  email: string;
  token_hash: string;
  expires_at: Date;
  accepted_at: Date | null;
  revoked_at: Date | null;
  created_by_user_id: string | null;
  created_at: Date;
};

@Injectable()
export class LeagueAdminInvitationService {
  constructor(
    @Inject('KYSELY_DB') private readonly db: Kysely<DB>,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly invitationEmailService: InvitationEmailService,
  ) {}

  async createInvitation(userId: string, dto: CreateLeagueAdminInviteDto) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership || membership.role !== 'league_admin') {
      throw new ForbiddenException('Only league admins can send league admin invitations.');
    }

    const email = dto.email.trim().toLowerCase();
    const existingActiveInvite = await this.db
      .selectFrom('league.league_admin_invitations')
      .select('id')
      .where(sql<string>`lower(email)`, '=', email)
      .where('accepted_at', 'is', null)
      .where(sql<boolean>`revoked_at is null`)
      .where('expires_at', '>', new Date())
      .executeTakeFirst();
    if (existingActiveInvite) {
      throw new ConflictException('An active league admin invitation already exists for this email.');
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invite = await this.db
      .insertInto('league.league_admin_invitations')
      .values({
        email,
        token_hash: tokenHash,
        expires_at: expiresAt,
        created_by_user_id: userId as any,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await this.invitationEmailService.sendInvitationEmail({
      to: email,
      leagueName: 'Swish',
      roleLabel: 'League Admin',
      expiresAt,
      acceptUrl: this.buildAcceptUrl(rawToken),
    });

    return { success: true, invitation: this.sanitizeInvite(invite as any) };
  }

  async verifyInvitation(rawToken: string) {
    const invite = await this.findInviteByToken(rawToken);

    if (invite.accepted_at) throw new BadRequestException('This invitation has already been used.');
    if (invite.revoked_at) throw new BadRequestException('This invitation has been revoked.');
    if (invite.expires_at.getTime() <= Date.now()) throw new BadRequestException('This invitation has expired.');

    const normalizedEmail = invite.email.trim().toLowerCase();
    const existingUser = await this.usersService.findByEmail(normalizedEmail);

    if (existingUser) {
      // Create a blank league immediately so the user becomes a league_admin for the new league.
      await this.acceptInviteForExistingUser(invite, existingUser.id);
      return { action: 'accepted', redirectTo: `${this.frontendUrl()}/login?invite=accepted&next=/admin/configure-league` };
    }

    const tempToken = this.jwtService.sign(
      { purpose: 'league-admin-invite-setup', inviteId: invite.id, email: normalizedEmail },
      { expiresIn: this.secondsUntil(invite.expires_at) },
    );

    return {
      action: 'create-account',
      redirectTo: `${this.frontendUrl()}/create-account?invite=${encodeURIComponent(tempToken)}&next=/admin/configure-league`,
    };
  }

  async acceptInviteForExistingUser(invite: AdminInviteRecord, userId: string) {
    await this.db.transaction().execute(async (trx) => {
      // Create a minimal league record; user can complete details in configure-league.
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

      await trx
        .insertInto('league.league_members')
        .values({ league_id: createdLeague.id, user_id: userId as any, role: 'league_admin' })
        .onConflict((oc) => oc.columns(['league_id', 'user_id']).doNothing())
        .execute();

      await trx
        .updateTable('auth.users')
        .set({ active_league_id: createdLeague.id as any })
        .where('id', '=', userId as any)
        .execute();

      await trx
        .updateTable('league.league_admin_invitations')
        .set({ accepted_at: new Date() })
        .where('id', '=', invite.id)
        .execute();
    });
  }

  private async findInviteByToken(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);
    const invite = await this.db
      .selectFrom('league.league_admin_invitations')
      .selectAll()
      .where('token_hash', '=', tokenHash)
      .executeTakeFirst();
    if (!invite) throw new BadRequestException('Invitation token is invalid.');
    return invite as any as AdminInviteRecord;
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private buildAcceptUrl(rawToken: string) {
    return `${this.apiUrl()}/league/admin-invitations/verify?token=${encodeURIComponent(rawToken)}`;
  }

  private frontendUrl() {
    return process.env.FRONTEND_URL ?? 'http://localhost:3000';
  }

  private apiUrl() {
    return process.env.API_URL ?? 'http://localhost:3002';
  }

  private secondsUntil(date: Date) {
    return Math.max(60, Math.floor((date.getTime() - Date.now()) / 1000));
  }

  private sanitizeInvite(invitation: { token_hash: string } & Record<string, unknown>) {
    const { token_hash, ...safe } = invitation;
    return safe;
  }
}
