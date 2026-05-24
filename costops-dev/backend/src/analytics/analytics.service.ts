import { Injectable, Logger } from '@nestjs/common';

export interface UsageSummaryDto {
  totalRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalTokensSaved: number;
  averageCompressionRatio: number;
  estimatedCostUsd: number;
  periodStart: string;
  periodEnd: string;
}

export interface DailyUsageDto {
  date: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  tokensSaved: number;
  costUsd: number;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  async getUsageSummary(userId: string, periodDays: number = 30): Promise<UsageSummaryDto> {
    this.logger.debug(`Usage summary for user ${userId}, period: ${periodDays}d`);
    const now = new Date().toISOString();
    return {
      totalRequests: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      totalTokensSaved: 0,
      averageCompressionRatio: 0,
      estimatedCostUsd: 0,
      periodStart: now,
      periodEnd: now,
    };
  }

  async getDailyUsage(userId: string, days: number = 30): Promise<DailyUsageDto[]> {
    this.logger.debug(`Daily usage for user ${userId}, days: ${days}`);
    return [];
  }

  async getTopModels(userId: string): Promise<{ model: string; count: number }[]> {
    this.logger.debug(`Top models for user ${userId}`);
    return [];
  }
}
