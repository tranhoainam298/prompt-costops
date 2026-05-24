import { Injectable, Logger } from '@nestjs/common';

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

  async getBalance(userId: string): Promise<WalletDto> {
    this.logger.debug(`Getting balance for user ${userId}`);
    return {
      userId,
      balanceTokens: 0,
      usedTokens: 0,
      monthlyBudget: 1_000_000,
    };
  }

  async credit(userId: string, amount: number, description: string): Promise<TransactionDto> {
    this.logger.log(`Crediting ${amount} tokens to user ${userId}`);
    return {
      id: '',
      userId,
      amount,
      type: 'credit',
      description,
      balanceAfter: amount,
      createdAt: new Date().toISOString(),
    };
  }

  async debit(userId: string, amount: number, description: string): Promise<TransactionDto> {
    this.logger.log(`Debiting ${amount} tokens from user ${userId}`);
    return {
      id: '',
      userId,
      amount: -amount,
      type: 'debit',
      description,
      balanceAfter: 0,
      createdAt: new Date().toISOString(),
    };
  }

  async getTransactions(userId: string): Promise<TransactionDto[]> {
    this.logger.debug(`Getting transactions for user ${userId}`);
    return [];
  }
}
