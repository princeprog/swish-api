export type LeagueInviteRole = 'scorekeeper' | 'team_manager' | 'team-manager';

export class CreateLeagueInviteDto {
  email!: string;
  role!: LeagueInviteRole;
}
