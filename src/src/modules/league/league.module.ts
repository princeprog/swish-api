import { Module } from '@nestjs/common';
import { LeagueService } from './league.service';
import { LeagueController } from './league.controller';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { LeagueInvitationService } from './league-invitation.service';
import { InvitationEmailService } from './invitation-email.service';
import { LeagueAdminInvitationService } from './league-admin-invitation.service';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [LeagueController],
  providers: [LeagueService, LeagueInvitationService, LeagueAdminInvitationService, InvitationEmailService],
  exports: [InvitationEmailService],
})
export class LeagueModule {}

