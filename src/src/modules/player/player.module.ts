import { Module } from '@nestjs/common';
import { PlayerController } from './player.controller';
import { PlayerService } from './player.service';
import { DatabaseModule } from 'src/database/database.module';
import { AuthModule } from '../auth/auth.module';
import { GameModule } from '../game/game.module';

@Module({
  imports: [DatabaseModule, AuthModule, GameModule],
  controllers: [PlayerController],
  providers: [PlayerService],
})
export class PlayerModule {}
