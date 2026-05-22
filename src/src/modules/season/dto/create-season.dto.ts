export class CreateSeasonDto {
  name: string;
  start_date: string;
  end_date: string;
  playoff_format: string;
  create_default_requirements?: boolean;
}
