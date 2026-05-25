import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'crypto';

export interface WalletDto {
  userId: string;
  balanceTokens: number;
  usedTokens: number;
  monthlyBudget: number;
}

export interface TransactionDto {
  id: string;
  userId: string;
  amount: number;
  type: 'credit' | 'debit';
  description: string;
  balanceAfter: number;
  createdAt: string;
}

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async getWallet(userId: string) {
    let wallet = await this.prisma.tokenWallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      // For development, dynamically create if missing. 
      // In production, user creation should handle this.
      wallet = await this.prisma.tokenWallet.create({
        data: {
          userId,
          dailyLimitTokens: 1_000_000,
          usedTodayTokens: 0,
          totalTokensAllTime: 0,
          hardLimitTokens: 2_000_000,
          resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
      });
    } else {
      // Check reset condition
      const now = new Date();
      if (wallet.resetAt && now > wallet.resetAt) {
        wallet = await this.prisma.tokenWallet.update({
          where: { id: wallet.id },
          data: {
            usedTodayTokens: 0,
            resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        });
      }
    }

    return wallet;
  }

  async getBalance(userId: string): Promise<WalletDto> {
    this.logger.debug(`Getting balance for user ${userId}`);
    const wallet = await this.getWallet(userId);
    return {
      userId,
      balanceTokens: Math.max(wallet.dailyLimitTokens - wallet.usedTodayTokens, 0),
      usedTokens: wallet.usedTodayTokens,
      monthlyBudget: wallet.dailyLimitTokens,
    };
  }

  async credit(userId: string, amount: number, description: string): Promise<TransactionDto> {
    this.logger.log(`Crediting ${amount} tokens to user ${userId}`);
    let wallet = await this.getWallet(userId);

    const newUsed = Math.max(wallet.usedTodayTokens - amount, 0);
    wallet = await this.prisma.tokenWallet.update({
      where: { id: wallet.id },
      data: { usedTodayTokens: newUsed },
    });

    return {
      id: randomUUID(),
      userId,
      amount,
      type: 'credit',
      description,
      balanceAfter: Math.max(wallet.dailyLimitTokens - newUsed, 0),
      createdAt: new Date().toISOString(),
    };
  }

  async debit(userId: string, amount: number, description: string): Promise<TransactionDto> {
    this.logger.log(`Debiting ${amount} tokens from user ${userId}`);
    let wallet = await this.getWallet(userId);

    const newUsed = wallet.usedTodayTokens + amount;
    wallet = await this.prisma.tokenWallet.update({
      where: { id: wallet.id },
      data: {
        usedTodayTokens: newUsed,
        totalTokensAllTime: { increment: amount },
      },
    });

    return {
      id: randomUUID(),
      userId,
      amount: -amount,
      type: 'debit',
      description,
      balanceAfter: Math.max(wallet.dailyLimitTokens - newUsed, 0),
      createdAt: new Date().toISOString(),
    };
  }

  async getTransactions(userId: string): Promise<TransactionDto[]> {
    this.logger.debug(`Getting transactions for user ${userId}`);
    return [];
  }
}
