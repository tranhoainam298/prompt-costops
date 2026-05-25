import { Controller, Get, Post, Delete, Param, Body, Headers, Logger, BadRequestException } from '@nestjs/common';
import { UsersService, ApiKeyDto } from './users.service';

@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly usersService: UsersService) {}

  private getActiveUserId(userId: string): string {
    return userId || '00000000-0000-0000-0000-000000000000';
  }

  @Post('api-key')
  async generateApiKey(
    @Headers('x-user-id') userId: string,
    @Body() body: { name: string },
  ): Promise<{ name: string; rawKey: string }> {
    if (!body || !body.name) {
      throw new BadRequestException('API Key name is required');
    }
    const activeUserId = this.getActiveUserId(userId);
    return this.usersService.generateApiKey(activeUserId, body.name);
  }

  @Get('api-keys')
  async listApiKeys(@Headers('x-user-id') userId: string): Promise<ApiKeyDto[]> {
    const activeUserId = this.getActiveUserId(userId);
    return this.usersService.listApiKeys(activeUserId);
  }

  @Delete('api-key/:id')
  async revokeApiKey(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
  ): Promise<{ success: boolean; message: string }> {
    if (!id) {
      throw new BadRequestException('API Key ID is required');
    }
    const activeUserId = this.getActiveUserId(userId);
    await this.usersService.revokeApiKey(activeUserId, id);
    return {
      success: true,
      message: 'API Key revoked successfully',
    };
  }
}
