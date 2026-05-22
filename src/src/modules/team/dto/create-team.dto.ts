export class CreateTeamDto {
  name: string;
  abbreviation: string;
  coach_name: string;
  primary_color: string;
  secondary_color: string;
  season_id?: number;
  division_id?: number | null;
}
