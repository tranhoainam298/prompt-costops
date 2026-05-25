import { Module } from '@nestjs/common';
import { AuthService } from './auth/auth.service';
import { UsersService } from './users/users.service';
import { TeamsService } from './teams/teams.service';
import { WalletService } from './wallet/wallet.service';
import { AnalyticsService } from './analytics/analytics.service';
import { PrismaModule } from './prisma/prisma.module';
import { AnalyticsController } from './analytics/analytics.controller';
import { WalletController } from './wallet/wallet.controller';
import { TeamsController } from './teams/teams.controller';
import { UsersController } from './users/users.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AnalyticsController, WalletController, TeamsController, UsersController],
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
