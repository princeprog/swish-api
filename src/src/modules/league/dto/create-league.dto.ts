export class CreateLeagueDto {
  name: string;
  logo_url?: string;
  description: string;
  location: string;
  contact_info: string;
  rules_config: Record<string, any>;
}

