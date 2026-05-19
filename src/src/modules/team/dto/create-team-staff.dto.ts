export class CreateTeamStaffDto {
  season_id!: number;
  role!: string;
  full_name!: string;
  email?: string | null;
  phone?: string | null;
}

