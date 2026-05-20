import { Inject, Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Kysely } from 'kysely';
import { DB } from 'src/database/db';
import { getUserLeagueMembership } from '../league/league-membership';
import { createHash, randomBytes } from 'crypto';
import { InvitationEmailService } from '../league/invitation-email.service';
import { sql } from 'kysely';

@Injectable()
export class SuperAdminService {
  constructor(
    @Inject('KYSELY_DB') private readonly db: Kysely<DB>,
    private readonly invitationEmailService: InvitationEmailService,
  ) {}

  async assertSuperAdmin(userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);
    if (!membership || String(membership.role).toUpperCase() !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Super admin access required.');
    }
    return membership;
  }

  async me(userId: string) {
    await this.assertSuperAdmin(userId);
    const user = await this.db.selectFrom('auth.users').select(['id', 'username', 'email']).where('id', '=', userId).executeTakeFirstOrThrow();
    return { ...user, role: 'SUPER_ADMIN' };
  }

  async setMaintenanceLock(userId: string, enabled: boolean, reason: string) {
    await this.assertSuperAdmin(userId);
    const before = await this.db.selectFrom('league.instance_controls').selectAll().where('id', '=', 'singleton').executeTakeFirst();

    await this.db
      .updateTable('league.instance_controls')
      .set({
        maintenance_lock_enabled: enabled,
        maintenance_lock_reason: reason ?? null,
        maintenance_lock_updated_by: userId,
        maintenance_lock_updated_at: new Date(),
      } as any)
      .where('id', '=', 'singleton')
      .execute();

    const after = await this.db.selectFrom('league.instance_controls').selectAll().where('id', '=', 'singleton').executeTakeFirst();
    await this.audit(userId, 'maintenance_lock.set', 'instance_controls', 'singleton', before, after, reason);
    return after;
  }

  async changeUserRole(userId: string, targetUserId: string, role: string, reason: string) {
    const membership = await this.assertSuperAdmin(userId);
    const targetMembership = await this.db.selectFrom('league.league_members').selectAll().where('user_id', '=', targetUserId).where('league_id', '=', membership.league_id).executeTakeFirst();
    if (!targetMembership) throw new NotFoundException('Target user membership not found.');
    const before = { ...targetMembership };
    await this.db.updateTable('league.league_members').set({ role } as any).where('id', '=', targetMembership.id).execute();
    const after = await this.db.selectFrom('league.league_members').selectAll().where('id', '=', targetMembership.id).executeTakeFirst();
    await this.audit(userId, 'user.role.change', 'league_member', String(targetMembership.id), before, after, reason);
    return after;
  }

  async revokeSessions(userId: string, targetUserId: string, reason: string) {
    await this.assertSuperAdmin(userId);
    const activeSessions = await this.db.selectFrom('auth.sessions').select(['id']).where('user_id', '=', targetUserId).where('revoked_at', 'is', null).execute();
    await this.db.updateTable('auth.sessions').set({ revoked_at: new Date() } as any).where('user_id', '=', targetUserId).where('revoked_at', 'is', null).execute();
    await this.audit(userId, 'user.sessions.revoke', 'user', targetUserId, { sessionCount: activeSessions.length }, { revoked: true }, reason);
    return { revokedSessions: activeSessions.length };
  }

  async listUsers(userId: string, email?: string) {
    const membership = await this.assertSuperAdmin(userId);
    let query = this.db
      .selectFrom('league.league_members as lm')
      .innerJoin('auth.users as u', 'u.id', 'lm.user_id')
      .select(['u.id as user_id', 'u.username', 'u.email', 'u.full_name', 'lm.role'])
      .where('lm.league_id', '=', membership.league_id as any);

    if (email?.trim()) {
      query = query.where('u.email', 'ilike', `%${email.trim()}%`);
    }

    return query.orderBy('u.email', 'asc').limit(100).execute();
  }

  async listLeagueAdmins(userId: string) {
    await this.assertSuperAdmin(userId);
    return this.db
      .selectFrom('league.league_members as lm')
      .innerJoin('auth.users as u', 'u.id', 'lm.user_id')
      .innerJoin('league.League as l', 'l.id', 'lm.league_id')
      .select([
        'u.id as user_id',
        'u.username',
        'u.email',
        'u.full_name',
        'lm.league_id',
        'l.name as league_name',
        'lm.created_at as assigned_at',
      ])
      .where('lm.role', '=', 'league_admin')
      .orderBy('lm.created_at', 'desc')
      .execute();
  }

  async removeLeagueAdminAndDeleteLeague(userId: string, targetUserId: string, reason: string) {
    await this.assertSuperAdmin(userId);
    if (userId === targetUserId) {
      throw new ForbiddenException('Super admin cannot remove their own account from this operation.');
    }

    const targetMembership = await this.db
      .selectFrom('league.league_members')
      .selectAll()
      .where('user_id', '=', targetUserId)
      .where('role', '=', 'league_admin')
      .executeTakeFirst();

    if (!targetMembership) throw new NotFoundException('League admin membership not found.');

    const league = await this.db.selectFrom('league.League').selectAll().where('id', '=', targetMembership.league_id).executeTakeFirst();
    const leagueMemberUserIds = await this.db
      .selectFrom('league.league_members')
      .select('user_id')
      .where('league_id', '=', targetMembership.league_id)
      .execute();

    await this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('league.League').where('id', '=', targetMembership.league_id).execute();
      const userIds = leagueMemberUserIds.map((row) => row.user_id);
      if (userIds.length > 0) {
        await trx.updateTable('auth.sessions').set({ revoked_at: new Date() } as any).where('user_id', 'in', userIds as any).where('revoked_at', 'is', null).execute();
      }
    });

    await this.audit(
      userId,
      'league_admin.remove_and_delete_league',
      'league_admin',
      targetUserId,
      { membership: targetMembership, league },
      { removed: true, league_deleted: true },
      reason,
    );

    return { success: true };
  }

  async listInvitations(userId: string) {
    await this.assertSuperAdmin(userId);
    const memberInvites = await this.db.selectFrom('league.league_invitations').selectAll().orderBy('created_at', 'desc').execute();
    const adminInvites = await this.db.selectFrom('league.league_admin_invitations').selectAll().orderBy('created_at', 'desc').execute();
    return { memberInvites, adminInvites };
  }

  async revokeInvitation(userId: string, invitationId: string, reason: string) {
    await this.assertSuperAdmin(userId);
    const invite = await this.db.selectFrom('league.league_invitations').selectAll().where('id', '=', invitationId).executeTakeFirst();
    const adminInvite = invite ? null : await this.db.selectFrom('league.league_admin_invitations').selectAll().where('id', '=', invitationId).executeTakeFirst();

    if (invite) {
      await this.db.updateTable('league.league_invitations').set({ revoked_at: new Date() } as any).where('id', '=', invitationId).execute();
      await this.audit(userId, 'invitation.revoke', 'league_invitation', invitationId, invite, { revoked_at: new Date() }, reason);
      return { success: true };
    }

    if (adminInvite) {
      await this.db.updateTable('league.league_admin_invitations').set({ revoked_at: new Date() } as any).where('id', '=', invitationId).execute();
      await this.audit(userId, 'invitation.revoke', 'league_admin_invitation', invitationId, adminInvite, { revoked_at: new Date() }, reason);
      return { success: true };
    }

    throw new NotFoundException('Invitation not found.');
  }

  async inviteLeagueAdmin(userId: string, emailInput: string) {
    await this.assertSuperAdmin(userId);
    const email = emailInput.trim().toLowerCase();
    const existingActiveInvite = await this.db
      .selectFrom('league.league_admin_invitations')
      .select('id')
      .where(sql<string>`lower(email)`, '=', email)
      .where('accepted_at', 'is', null)
      .where(sql<boolean>`revoked_at is null`)
      .where('expires_at', '>', new Date())
      .executeTakeFirst();
    if (existingActiveInvite) throw new ForbiddenException('An active league admin invitation already exists for this email.');

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invite = await this.db
      .insertInto('league.league_admin_invitations')
      .values({ email, token_hash: tokenHash, expires_at: expiresAt, created_by_user_id: userId as any })
      .returningAll()
      .executeTakeFirstOrThrow();

    await this.invitationEmailService.sendInvitationEmail({
      to: email,
      leagueName: 'Swish',
      roleLabel: 'League Admin',
      expiresAt,
      acceptUrl: `${process.env.API_URL ?? 'http://localhost:3002'}/league/admin-invitations/verify?token=${encodeURIComponent(rawToken)}`,
    });

    await this.audit(userId, 'invitation.league_admin.create', 'league_admin_invitation', invite.id, null, { email, expires_at: expiresAt }, 'Invite league admin');
    return { success: true };
  }

  async auditLog(userId: string, filters?: { actionType?: string; dateFrom?: string; dateTo?: string }) {
    await this.assertSuperAdmin(userId);
    let query = this.db.selectFrom('league.super_admin_audit_log').selectAll();
    if (filters?.actionType?.trim()) query = query.where('action_type', '=', filters.actionType.trim());
    if (filters?.dateFrom?.trim()) query = query.where('created_at', '>=', new Date(filters.dateFrom.trim()) as any);
    if (filters?.dateTo?.trim()) query = query.where('created_at', '<=', new Date(filters.dateTo.trim()) as any);
    return query.orderBy('created_at', 'desc').limit(200).execute();
  }

  private async audit(actorUserId: string, actionType: string, targetType: string, targetId: string, before: unknown, after: unknown, reason?: string) {
    await this.db.insertInto('league.super_admin_audit_log').values({
      actor_user_id: actorUserId,
      action_type: actionType,
      target_type: targetType,
      target_id: targetId,
      before_snapshot: JSON.stringify(before ?? null) as any,
      after_snapshot: JSON.stringify(after ?? null) as any,
      reason: reason ?? null,
    } as any).execute();
  }
}
