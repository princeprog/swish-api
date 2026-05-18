export class ClockActionDto {
  action: 'start' | 'pause' | 'resume' | 'end_period' | 'start_overtime';
  clock_time?: string;
}
