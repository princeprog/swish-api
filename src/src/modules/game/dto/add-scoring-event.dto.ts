export class AddScoringEventDto {
  team_id: number;
  player_id: number;
  period: number;
  clock_time: string;
  shot_type: 'FT' | '2PT' | '3PT';
}
