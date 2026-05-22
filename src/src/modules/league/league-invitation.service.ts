import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import { createHash, randomBytes } from 'crypto';
import { DB } from 'src/database/db';
import { CreateLeagueInviteDto, LeagueInviteRole } from './dto/create-league-invite.dto';
import { UsersService } from '../users/users.service';
import { InvitationEmailService } from './invitation-email.service';
import { getUserLeagueMembership } from './league-membership';

type InviteRecord = {
  id: string;
  league_id: number;
  email: string;
  role: string;
  token_hash: string;
  expires_at: Date;
  accepted_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
  league_name: string;
};

export type InviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export type LeagueInviteListItem = Omit<InviteRecord, 'token_hash'> & {
  status: InviteStatus;
};

export type LeagueInviteListResponse = {
  data: LeagueInviteListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type InviteClaims = {
  purpose: 'invite-setup';
  inviteId: string;
  email: string;
  leagueId: number;
  role: string;
};

@Injectable()
export class LeagueInvitationService {
  constructor(
    @Inject('KYSELY_DB') private readonly db: Kysely<DB>,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly invitationEmailService: InvitationEmailService,
  ) {}

  async createInvitation(userId: string, dto: CreateLeagueInviteDto) {
    const membership = await getUserLeagueMembership(this.db, userId);

    if (!membership || membership.role !== 'league_admin') {
      throw new ForbiddenException('Only league admins can send invitations.');
    }

    const league = await this.db
      .selectFrom('league.League')
      .select(['id', 'name'])
      .where('id', '=', membership.league_id)
      .executeTakeFirstOrThrow();

    const normalizedRole = this.normalizeRole(dto.role);
    const existingActiveInvite = await this.db
      .selectFrom('league.league_invitations')
      .select('id')
      .where('league_id', '=', league.id)
      .where('email', '=', dto.email)
      .where('accepted_at', 'is', null)
      .where(sql<boolean>`revoked_at is null`)
      .where('expires_at', '>', new Date())
      .executeTakeFirst();

    if (existingActiveInvite) {
      throw new ConflictException('An active invitation already exists for this email.');
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await this.db.transaction().execute(async (trx) => {
      const createdInvite = await trx
        .insertInto('league.league_invitations')
        .values({
          league_id: league.id,
          email: dto.email,
          role: normalizedRole,
          token_hash: tokenHash,
          expires_at: expiresAt,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      const leagueInvite = {
        ...createdInvite,
        league_name: league.name,
      };

      await this.invitationEmailService.sendInvitationEmail({
        to: dto.email,
        leagueName: league.name,
        roleLabel: this.roleLabel(normalizedRole),
        expiresAt,
        acceptUrl: this.buildAcceptUrl(rawToken),
      });

      return leagueInvite;
    });

    return {
      success: true,
      invitation: this.sanitizeInvitation(invitation),
    };
  }

  async verifyInvitation(rawToken: string) {
    const invite = await this.findInviteByToken(rawToken);

    if (invite.accepted_at) {
      throw new BadRequestException('This invitation has already been used.');
    }

    if (invite.revoked_at) {
      throw new BadRequestException('This invitation has been revoked.');
    }

    if (invite.expires_at.getTime() <= Date.now()) {
      throw new BadRequestException('This invitation has expired.');
    }

    // Emails can arrive with odd casing/whitespace (copied from email clients, etc.).
    // Normalize before lookup to avoid mis-routing the user.
    const normalizedEmail = invite.email.trim().toLowerCase();
    const existingUser = await this.usersService.findByEmail(normalizedEmail);

    if (existingUser) {
      await this.acceptInviteForUser({ ...invite, email: normalizedEmail } as InviteRecord, existingUser.id);
      return {
        action: 'accepted',
        redirectTo: `${this.frontendUrl()}/login?invite=accepted`,
      };
    }

    const tempToken = this.jwtService.sign(
      {
        purpose: 'invite-setup',
        inviteId: invite.id,
        email: normalizedEmail,
        leagueId: invite.league_id,
        role: invite.role,
      } satisfies InviteClaims,
      { expiresIn: this.secondsUntil(invite.expires_at) },
    );

    return {
      action: 'create-account',
      redirectTo: `${this.frontendUrl()}/create-account?invite=${encodeURIComponent(tempToken)}`,
    };
  }

  async listInvitations(userId: string, page = 1, limit = 10): Promise<LeagueInviteListResponse> {
    const membership = await getUserLeagueMembership(this.db, userId);

    if (!membership || membership.role !== 'league_admin') {
      throw new ForbiddenException('Only league admins can view invitations.');
    }

    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 10));
    const offset = (safePage - 1) * safeLimit;

    const totalResult = await this.db
      .selectFrom('league.league_invitations')
      .select(({ fn }) => fn.countAll<number>().as('count'))
      .where('league_id', '=', membership.league_id)
      .executeTakeFirstOrThrow();

    const rows = await this.db
      .selectFrom('league.league_invitations as i')
      .innerJoin('league.League as l', 'l.id', 'i.league_id')
      .selectAll('i')
      .select(['l.name as league_name'])
      .where('i.league_id', '=', membership.league_id)
      .orderBy('i.created_at', 'desc')
      .limit(safeLimit)
      .offset(offset)
      .execute();

    const now = Date.now();
    const data = rows.map((row) => ({
      ...row,
      status: row.accepted_at
        ? 'accepted'
        : row.revoked_at
          ? 'revoked'
          : row.expires_at.getTime() <= now
            ? 'expired'
            : 'pending',
    })) satisfies LeagueInviteListItem[];

    return {
      data,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: Number(totalResult.count ?? 0),
        totalPages: Math.max(1, Math.ceil(Number(totalResult.count ?? 0) / safeLimit)),
      },
    };
  }

  async revokeInvitation(userId: string, invitationId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);

    if (!membership || membership.role !== 'league_admin') {
      throw new ForbiddenException('Only league admins can revoke invitations.');
    }

    const invitation = await this.db
      .selectFrom('league.league_invitations')
      .select(['id', 'accepted_at', 'revoked_at'])
      .where('id', '=', invitationId)
      .where('league_id', '=', membership.league_id)
      .executeTakeFirstOrThrow();

    if (invitation.accepted_at) {
      throw new BadRequestException('This invitation has already been accepted.');
    }

    if (invitation.revoked_at) {
      throw new BadRequestException('This invitation has already been revoked.');
    }

    const revokedAt = new Date();

    const revokedInvitation = await this.db
      .updateTable('league.league_invitations')
      .set({ revoked_at: revokedAt })
      .where('id', '=', invitationId)
      .where('league_id', '=', membership.league_id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      success: true,
      invitation: revokedInvitation,
    };
  }

  private async acceptInviteForUser(invite: InviteRecord, userId: string) {
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('league.league_members')
        .values({
          league_id: invite.league_id,
          user_id: userId as any,
          role: invite.role,
        })
        .onConflict((oc) => oc.columns(['league_id', 'user_id']).doNothing())
        .execute();

      await trx
        .updateTable('auth.users')
        .set({ active_league_id: invite.league_id as any })
        .where('id', '=', userId as any)
        .execute();

      await trx
        .updateTable('league.league_invitations')
        .set({ accepted_at: new Date() })
        .where('id', '=', invite.id)
        .execute();
    });
  }

  private async findInviteByToken(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);
    const invite = await this.db
      .selectFrom('league.league_invitations as i')
      .innerJoin('league.League as l', 'l.id', 'i.league_id')
      .selectAll('i')
      .select(['l.name as league_name'])
      .where('i.token_hash', '=', tokenHash)
      .executeTakeFirst();

    if (!invite) {
      throw new BadRequestException('Invitation token is invalid.');
    }

    return invite as InviteRecord;
  }

  private normalizeRole(role: LeagueInviteRole) {
    return role === 'team-manager' ? 'team_manager' : role;
  }

  private roleLabel(role: string) {
    return role === 'scorekeeper' ? 'Scorekeeper' : 'Team Manager';
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private buildAcceptUrl(rawToken: string) {
    return `${this.apiUrl()}/league/invitations/verify?token=${encodeURIComponent(rawToken)}`;
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

  private sanitizeInvitation(invitation: { token_hash: string } & Record<string, unknown>) {
    const { token_hash, ...safe } = invitation;
    return safe;
  }
}
