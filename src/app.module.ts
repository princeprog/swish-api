import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './src/modules/users/users.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './src/modules/auth/auth.module';
import { LeagueModule } from './src/modules/league/league.module';
import { SeasonModule } from './src/modules/season/season.module';
import { TeamModule } from './src/modules/team/team.module';
import { GameModule } from './src/modules/game/game.module';
import { PlayerModule } from './src/modules/player/player.module';
import { SuperAdminModule } from './src/modules/super-admin/super-admin.module';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    UsersModule,
    DatabaseModule,
    AuthModule,
    LeagueModule,
    SeasonModule,
    TeamModule,
    GameModule,
    PlayerModule,
    SuperAdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
