import { Controller, Get, Post, Put, Body, Headers, Logger, BadRequestException } from '@nestjs/common';
import { TeamsService, TeamMemberDto } from './teams.service';

@Controller('teams')
export class TeamsController {
  private readonly logger = new Logger(TeamsController.name);

  constructor(private readonly teamsService: TeamsService) {}

  private async getOrCreateActiveTeam(userId: string) {
    const activeUserId = userId || '00000000-0000-0000-0000-000000000000';
    let team = await this.teamsService.findByOwnerId(activeUserId);
    if (!team) {
      this.logger.log(`No team found for user ${activeUserId}. Auto-generating default workspace team.`);
      team = await this.teamsService.create({
        name: 'Default Workspace Team',
        ownerId: activeUserId,
        defaultDailyLimit: 1_000_000,
      });
    }
    return team;
  }

  @Get('info')
  async getTeamInfo(@Headers('x-user-id') userId: string): Promise<TeamMemberDto[]> {
    const team = await this.getOrCreateActiveTeam(userId);
    return this.teamsService.getTeamMembers(team.id);
  }

  @Post('members')
  async addMember(
    @Headers('x-user-id') userId: string,
    @Body() body: { email: string },
  ): Promise<{ success: boolean; message: string }> {
    if (!body || !body.email) {
      throw new BadRequestException('Email is required');
    }
    const team = await this.getOrCreateActiveTeam(userId);
    await this.teamsService.addMember(team.id, body.email);
    return {
      success: true,
      message: `Member ${body.email} added to team successfully.`,
    };
  }

  @Put('quota')
  async allocateQuota(
    @Headers('x-user-id') userId: string,
    @Body() body: { memberId: string; tokensLimit: number },
  ): Promise<{ success: boolean; message: string }> {
    if (!body || !body.memberId || body.tokensLimit === undefined) {
      throw new BadRequestException('memberId and tokensLimit are required');
    }
    const team = await this.getOrCreateActiveTeam(userId);
    await this.teamsService.allocateQuota(team.id, body.memberId, body.tokensLimit);
    return {
      success: true,
      message: `Allocated ${body.tokensLimit} daily tokens limit to member successfully.`,
    };
  }
}
