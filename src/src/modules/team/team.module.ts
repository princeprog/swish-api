import { Module } from '@nestjs/common';
import { TeamService } from './team.service';
import { TeamController } from './team.controller';
import { TeamStatsController } from './team-stats.controller';
import { DatabaseModule } from 'src/database/database.module';
import { AuthModule } from '../auth/auth.module';
import { GameModule } from '../game/game.module';

@Module({
  imports: [DatabaseModule, AuthModule, GameModule],
  controllers: [TeamController, TeamStatsController],
  providers: [TeamService],
  exports: [TeamService],
})
export class TeamModule {}
