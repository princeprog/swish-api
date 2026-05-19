import type { Kysely } from 'kysely';
import { DB } from 'src/database/db';

export type SeasonTeamEligibilityRow = {
  team_id: number;
  team_name: string;
  division_id: number | null;

  active_roster_count: number;
  min_required_roster_players: number;

  roster_ready: boolean;
  compliance_ready: boolean;
  schedule_eligible: boolean;

  // Granular flags for UI/debugging.
  is_complete: boolean;
  is_finalized: boolean;
  has_required_identity: boolean;
  has_required_staff: boolean;
  has_required_compliance_items: boolean;

  reasons: string[];
};

function isStatusSatisfied(status: string | null | undefined) {
  return status === 'complete' || status === 'waived';
}

export async function computeSeasonTeamEligibility(
  db: Kysely<DB>,
  leagueId: number,
  seasonId: number,
): Promise<SeasonTeamEligibilityRow[]> {
  const league = await db
    .selectFrom('league.League')
    .select(['rules_config'])
    .where('id', '=', leagueId)
    .executeTakeFirst();
  const minRequired = Number((league?.rules_config as any)?.min_roster_players ?? 5);

  const seasonTeams = await db
    .selectFrom('league.SeasonTeam as st')
    .innerJoin('league.Teams as t', 't.id', 'st.team_id')
    .select(['t.id as team_id', 't.name as team_name', 'st.is_finalized', 'st.division_id'])
    .where('st.season_id', '=', seasonId)
    .where('t.league_id', '=', leagueId)
    .execute();

  const teamIds = seasonTeams.map((t) => Number(t.team_id));
  if (teamIds.length === 0) return [];

  const rosterCounts = await db
    .selectFrom('player.Roster')
    .select(['team_id'])
    .select((eb) => eb.fn.count('id').as('count'))
    .where('season_id', '=', seasonId)
    .where('team_id', 'in', teamIds)
    .where('status', '=', 'Active')
    .groupBy('team_id')
    .execute();
  const activeCountByTeam = new Map<number, number>(
    rosterCounts.map((r: any) => [Number(r.team_id), Number(r.count ?? 0)]),
  );

  const identityRows = await db
    .selectFrom('league.season_team_identity')
    .select(['team_id', 'display_name', 'primary_color', 'secondary_color'])
    .where('season_id', '=', seasonId)
    .where('team_id', 'in', teamIds)
    .execute();
  const identityByTeam = new Map<number, any>(identityRows.map((r: any) => [Number(r.team_id), r]));

  const complianceItems = await db
    .selectFrom('league.team_compliance_items')
    .select(['id', 'key', 'is_required', 'season_id', 'division_id', 'archived_at'])
    .where('league_id', '=', leagueId)
    .where('is_required', '=', true)
    .where('archived_at', 'is', null)
    .where((eb) => eb.or([eb('season_id', 'is', null), eb('season_id', '=', seasonId)]))
    .execute();

  const complianceStatuses = await db
    .selectFrom('league.team_compliance_status')
    .select(['team_id', 'item_id', 'status'])
    .where('league_id', '=', leagueId)
    .where('season_id', '=', seasonId)
    .where('team_id', 'in', teamIds)
    .execute();
  const statusByTeamItem = new Map<string, string>(
    complianceStatuses.map((s: any) => [`${Number(s.team_id)}:${Number(s.item_id)}`, String(s.status)]),
  );

  const requiredRoles = await db
    .selectFrom('league.team_staff_required_roles')
    .select(['role', 'is_required', 'season_id', 'division_id'])
    .where('league_id', '=', leagueId)
    .where('is_required', '=', true)
    .where((eb) => eb.or([eb('season_id', 'is', null), eb('season_id', '=', seasonId)]))
    .execute();

  const teamStaff = await db
    .selectFrom('league.team_staff')
    .select(['team_id', 'role'])
    .where('league_id', '=', leagueId)
    .where('season_id', '=', seasonId)
    .where('team_id', 'in', teamIds)
    .execute();
  const staffRolesByTeam = new Map<number, Set<string>>();
  for (const row of teamStaff as any[]) {
    const teamId = Number(row.team_id);
    const set = staffRolesByTeam.get(teamId) ?? new Set<string>();
    set.add(String(row.role));
    staffRolesByTeam.set(teamId, set);
  }

  const out: SeasonTeamEligibilityRow[] = [];
  for (const t of seasonTeams as any[]) {
    const teamId = Number(t.team_id);
    const divisionId = t.division_id === null || t.division_id === undefined ? null : Number(t.division_id);
    const activeCount = activeCountByTeam.get(teamId) ?? 0;

    const isComplete = activeCount >= minRequired;
    const isFinalized = Boolean(t.is_finalized);

    const reasons: string[] = [];
    if (!isComplete) reasons.push('insufficient_active_players');
    if (!isFinalized) reasons.push('not_finalized');

    const identity = identityByTeam.get(teamId);
    const hasRequiredIdentity = Boolean(
      identity &&
        identity.display_name &&
        identity.primary_color &&
        identity.secondary_color,
    );
    if (!hasRequiredIdentity) reasons.push('missing_team_identity');

    // Compliance items: required within league scope + season scope + (optionally) division scope.
    const applicableItems = complianceItems.filter((i: any) => {
      const divOk = i.division_id == null || Number(i.division_id) === Number(divisionId);
      const seasonOk = i.season_id == null || Number(i.season_id) === Number(seasonId);
      return divOk && seasonOk;
    });
    let hasRequiredComplianceItems = true;
    for (const item of applicableItems as any[]) {
      const status = statusByTeamItem.get(`${teamId}:${Number(item.id)}`);
      if (!isStatusSatisfied(status)) {
        hasRequiredComplianceItems = false;
        reasons.push(`compliance_item_incomplete:${String(item.key)}`);
      }
    }

    // Staff requirements: required roles within league+season(+division) scope.
    const applicableRequiredRoles = requiredRoles.filter((r: any) => {
      const divOk = r.division_id == null || Number(r.division_id) === Number(divisionId);
      const seasonOk = r.season_id == null || Number(r.season_id) === Number(seasonId);
      return divOk && seasonOk;
    });
    const staffSet = staffRolesByTeam.get(teamId) ?? new Set<string>();
    let hasRequiredStaff = true;
    for (const rr of applicableRequiredRoles as any[]) {
      const role = String(rr.role);
      if (!staffSet.has(role)) {
        hasRequiredStaff = false;
        reasons.push(`missing_staff_role:${role}`);
      }
    }

    const rosterReady = isComplete && isFinalized;
    const complianceReady = hasRequiredIdentity && hasRequiredComplianceItems && hasRequiredStaff;
    out.push({
      team_id: teamId,
      team_name: String(t.team_name),
      division_id: divisionId,
      active_roster_count: activeCount,
      min_required_roster_players: minRequired,
      roster_ready: rosterReady,
      compliance_ready: complianceReady,
      schedule_eligible: rosterReady && complianceReady,
      is_complete: isComplete,
      is_finalized: isFinalized,
      has_required_identity: hasRequiredIdentity,
      has_required_staff: hasRequiredStaff,
      has_required_compliance_items: hasRequiredComplianceItems,
      reasons,
    });
  }

  // Admin UX: not-eligible first.
  out.sort((a, b) => Number(a.schedule_eligible) - Number(b.schedule_eligible));
  return out;
}

