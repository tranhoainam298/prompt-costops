import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

  constructor(private readonly prisma: PrismaService) {}

  async getUsageSummary(userId: string, periodDays: number = 30): Promise<UsageSummaryDto> {
    this.logger.debug(`Fetching real DB usage summary for user ${userId}, period: ${periodDays}d`);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - periodDays);

    const stats = await this.prisma.promptLog.aggregate({
      where: {
        userId,
        createdAt: {
          gte: cutoffDate,
        },
      },
      _count: {
        id: true,
      },
      _sum: {
        originalTokens: true,
        optimizedTokens: true,
        completionTokens: true,
        estimatedCostUsd: true,
      },
      _avg: {
        compressionRatio: true,
      },
      _min: {
        createdAt: true,
      },
      _max: {
        createdAt: true,
      },
    });

    const totalRequests = stats._count.id || 0;
    const original = stats._sum.originalTokens || 0;
    const optimized = stats._sum.optimizedTokens || 0;
    const completion = stats._sum.completionTokens || 0;
    const cost = stats._sum.estimatedCostUsd || 0.0;
    const saved = Math.max(original - optimized, 0);
    const avgCompression = stats._avg.compressionRatio || 0.0;

    const start = stats._min.createdAt ? stats._min.createdAt.toISOString() : cutoffDate.toISOString();
    const end = stats._max.createdAt ? stats._max.createdAt.toISOString() : new Date().toISOString();

    return {
      totalRequests,
      totalPromptTokens: original,
      totalCompletionTokens: completion,
      totalTokens: optimized + completion,
      totalTokensSaved: saved,
      averageCompressionRatio: avgCompression,
      estimatedCostUsd: cost,
      periodStart: start,
      periodEnd: end,
    };
  }

  async getDailyUsage(userId: string, days: number = 30): Promise<DailyUsageDto[]> {
    this.logger.debug(`Fetching real DB daily usage for user ${userId}, days: ${days}`);
    
    // Group-by using direct PostgreSQL raw queries for accurate date truncation and performance.
    try {
      const rawData = await this.prisma.$queryRaw<any[]>`
        SELECT 
          TO_CHAR(created_at, 'YYYY-MM-DD') as "date",
          COUNT(*)::int as "requests",
          SUM(original_tokens)::int as "promptTokens",
          SUM(completion_tokens)::int as "completionTokens",
          SUM(original_tokens - optimized_tokens)::int as "tokensSaved",
          SUM(estimated_cost_usd)::float as "costUsd"
        FROM prompt_logs
        WHERE user_id = ${userId}::uuid AND created_at >= NOW() - CAST(${days} || ' days' AS INTERVAL)
        GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
        ORDER BY TO_CHAR(created_at, 'YYYY-MM-DD') ASC
      `;

      return rawData.map((row) => ({
        date: row.date,
        requests: row.requests || 0,
        promptTokens: row.promptTokens || 0,
        completionTokens: row.completionTokens || 0,
        tokensSaved: row.tokensSaved || 0,
        costUsd: row.costUsd || 0.0,
      }));
    } catch (err) {
      this.logger.error(`Failed to aggregate raw daily usage query: ${err.message}`, err.stack);
      return [];
    }
  }

  async getTopModels(userId: string): Promise<{ model: string; count: number }[]> {
    this.logger.debug(`Fetching real DB top models for user ${userId}`);
    
    const groups = await this.prisma.promptLog.groupBy({
      by: ['modelUsed'],
      where: {
        userId,
      },
      _count: {
        modelUsed: true,
      },
      orderBy: {
        _count: {
          modelUsed: 'desc',
        },
      },
    });

    return groups.map((g) => ({
      model: g.modelUsed,
      count: g._count.modelUsed,
    }));
  }
}
