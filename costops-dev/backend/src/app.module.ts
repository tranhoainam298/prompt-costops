import { Module } from '@nestjs/common';
import { AuthService } from './auth/auth.service';
import { UsersService } from './users/users.service';
import { TeamsService } from './teams/teams.service';
import { WalletService } from './wallet/wallet.service';
import { AnalyticsService } from './analytics/analytics.service';

@Module({
  imports: [],
  controllers: [],
  providers: [
    AuthService,
    UsersService,
    TeamsService,
    WalletService,
    AnalyticsService,
  ],
  exports: [
    AuthService,
    UsersService,
    TeamsService,
    WalletService,
    AnalyticsService,
  ],
})
export class AppModule {}
