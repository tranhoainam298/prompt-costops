import { Controller, Get, Headers, Logger } from '@nestjs/common';
import { WalletService, WalletDto } from './wallet.service';

@Controller('wallet')
export class WalletController {
  private readonly logger = new Logger(WalletController.name);

  constructor(private readonly walletService: WalletService) {}

  @Get('balance')
  async getBalance(@Headers('x-user-id') userId: string): Promise<WalletDto> {
    const activeUserId = userId || '00000000-0000-0000-0000-000000000000';
    return this.walletService.getBalance(activeUserId);
  }
}
