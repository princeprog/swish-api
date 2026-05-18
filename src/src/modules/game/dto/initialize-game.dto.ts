export class InitializeGameDto {
  home_starter_player_ids: number[];
  away_starter_player_ids: number[];
  home_dnp_player_ids?: number[];
  away_dnp_player_ids?: number[];
  initial_period: number;
  initial_clock_time: string;
}
