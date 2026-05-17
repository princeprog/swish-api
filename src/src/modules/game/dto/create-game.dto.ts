export class CreateGameDto {
  season_id: number;
  home_team: number;
  away_team: number;
  scheduled_at: string;
  venue: string;
  game_type: string;
}
