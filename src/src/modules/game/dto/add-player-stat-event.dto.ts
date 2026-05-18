export class AddPlayerStatEventDto {
  team_id: number;
  player_id: number;
  period: number;
  clock_time: string;
  stat_type:
    | 'OREB'
    | 'DREB'
    | 'AST'
    | 'TOV'
    | 'STL'
    | 'BLK'
    | 'PF'
    | 'MIN'
    | 'MISS_FT'
    | 'MISS_2PT'
    | 'MISS_3PT';
  value?: number;
}
