export class UpdateSeasonDivisionDto {
  name?: string;
  code?: string;
  sort_order?: number;
  age_min?: number | null;
  age_max?: number | null;
  is_open?: boolean;
  rules_config?: any;
}

