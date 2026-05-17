import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './src/modules/users/users.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './src/modules/auth/auth.module';
import { LeagueModule } from './src/modules/league/league.module';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    UsersModule,
    DatabaseModule,
    AuthModule,
    LeagueModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
