import { Controller, Get, Query, Headers, Logger } from '@nestjs/common';
import { AnalyticsService, UsageSummaryDto, DailyUsageDto } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  async getSummary(
    @Headers('x-user-id') userId: string,
    @Query('periodDays') periodDays?: string,
  ): Promise<UsageSummaryDto> {
    const activeUserId = userId || '00000000-0000-0000-0000-000000000000';
    const days = periodDays ? parseInt(periodDays, 10) : 30;
    return this.analyticsService.getUsageSummary(activeUserId, days);
  }

  @Get('daily')
  async getDaily(
    @Headers('x-user-id') userId: string,
    @Query('days') days?: string,
  ): Promise<DailyUsageDto[]> {
    const activeUserId = userId || '00000000-0000-0000-0000-000000000000';
    const limitDays = days ? parseInt(days, 10) : 30;
    return this.analyticsService.getDailyUsage(activeUserId, limitDays);
  }

  @Get('history')
  async getHistory(
    @Headers('x-user-id') userId: string,
    @Query('limit') limit?: string,
  ): Promise<any[]> {
    const activeUserId = userId || '00000000-0000-0000-0000-000000000000';
    const limitNum = limit ? parseInt(limit, 10) : 50;
    return this.analyticsService.getHistory(activeUserId, limitNum);
  }
}
