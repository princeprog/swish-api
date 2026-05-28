export class UpdateSeasonDivisionDto {
  name?: string;
  code?: string;
  description?: string | null;
  sort_order?: number;
  age_min?: number | null;
  age_max?: number | null;
  is_open?: boolean;
  team_capacity?: number | null;
  rules_config?: any;
}
