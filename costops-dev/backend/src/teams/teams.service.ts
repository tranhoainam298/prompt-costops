import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface TeamDto {
  id: string;
  name: string;
  ownerId: string;
  defaultDailyLimit: number;
  createdAt: string;
}

export interface CreateTeamDto {
  name: string;
  ownerId: string;
  defaultDailyLimit?: number;
}

export interface TeamMemberDto {
  userId: string;
  username: string;
  email: string;
  role: string;
  allocatedQuota: number;
  usedTokens: number;
  joinedAt: string;
}

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateTeamDto): Promise<TeamDto> {
    this.logger.log(`Creating team: ${data.name}`);
    const team = await this.prisma.team.create({
      data: {
        name: data.name,
        ownerId: data.ownerId,
        defaultDailyLimit: data.defaultDailyLimit ?? 500_000,
      },
    });
    return {
      id: team.id,
      name: team.name,
      ownerId: team.ownerId,
      defaultDailyLimit: team.defaultDailyLimit,
      createdAt: team.createdAt.toISOString(),
    };
  }

  async findById(id: string): Promise<TeamDto | null> {
    this.logger.debug(`Finding team by id: ${id}`);
    const team = await this.prisma.team.findUnique({ where: { id } });
    if (!team) return null;
    return {
      id: team.id,
      name: team.name,
      ownerId: team.ownerId,
      defaultDailyLimit: team.defaultDailyLimit,
      createdAt: team.createdAt.toISOString(),
    };
  }

  async findByOwnerId(ownerId: string): Promise<TeamDto | null> {
    const team = await this.prisma.team.findFirst({ where: { ownerId } });
    if (!team) return null;
    return {
      id: team.id,
      name: team.name,
      ownerId: team.ownerId,
      defaultDailyLimit: team.defaultDailyLimit,
      createdAt: team.createdAt.toISOString(),
    };
  }

  async listAll(): Promise<TeamDto[]> {
    this.logger.debug('Listing all teams');
    const teams = await this.prisma.team.findMany();
    return teams.map((t) => ({
      id: t.id,
      name: t.name,
      ownerId: t.ownerId,
      defaultDailyLimit: t.defaultDailyLimit,
      createdAt: t.createdAt.toISOString(),
    }));
  }

  async addMember(teamId: string, email: string): Promise<boolean> {
    this.logger.log(`Adding member with email ${email} to team ${teamId}`);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException(`User with email ${email} not found`);
    }

    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) {
      throw new NotFoundException(`Team with id ${teamId} not found`);
    }

    // Check if membership already exists
    const existing = await this.prisma.teamMember.findUnique({
      where: {
        userId_teamId: {
          userId: user.id,
          teamId: teamId,
        },
      },
    });

    if (existing) {
      throw new BadRequestException('User is already a member of this team');
    }

    await this.prisma.teamMember.create({
      data: {
        teamId: teamId,
        userId: user.id,
      },
    });

    // Create a wallet for the member if it doesn't exist
    const wallet = await this.prisma.tokenWallet.findUnique({
      where: { userId: user.id },
    });

    if (!wallet) {
      await this.prisma.tokenWallet.create({
        data: {
          userId: user.id,
          dailyLimitTokens: 100_000, // Default sub-quota
          usedTodayTokens: 0,
          totalTokensAllTime: 0,
          hardLimitTokens: 200_000,
        },
      });
    }

    return true;
  }

  async allocateQuota(teamId: string, memberId: string, tokensLimit: number): Promise<boolean> {
    this.logger.log(`Allocating ${tokensLimit} tokens sub-quota to member ${memberId} in team ${teamId}`);
    
    // Check if the user is a member of the team
    const membership = await this.prisma.teamMember.findUnique({
      where: {
        userId_teamId: {
          userId: memberId,
          teamId,
        },
      },
    });

    if (!membership) {
      throw new BadRequestException('User is not a member of this team');
    }

    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) {
      throw new NotFoundException('Team not found');
    }

    // Get the team owner's wallet (acting as master budget)
    const ownerWallet = await this.prisma.tokenWallet.findUnique({
      where: { userId: team.ownerId },
    });

    if (!ownerWallet) {
      throw new NotFoundException('Team Master Wallet is not initialized');
    }

    // Ensure allocation does not exceed Master Budget limit
    if (tokensLimit > ownerWallet.dailyLimitTokens) {
      throw new BadRequestException(
        `Allocation limit (${tokensLimit}) exceeds Team Master Budget limit (${ownerWallet.dailyLimitTokens})`
      );
    }

    // Update the member's wallet limit
    await this.prisma.tokenWallet.update({
      where: { userId: memberId },
      data: {
        dailyLimitTokens: tokensLimit,
        hardLimitTokens: tokensLimit * 2, // Symmetrical scale
      },
    });

    return true;
  }

  async getTeamMembers(teamId: string): Promise<TeamMemberDto[]> {
    this.logger.debug(`Fetching member statistics for team: ${teamId}`);
    
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    });
    if (!team) {
      throw new NotFoundException('Team not found');
    }

    // Query all members
    const members = await this.prisma.teamMember.findMany({
      where: { teamId },
      include: {
        user: {
          include: {
            wallet: true,
          },
        },
      },
    });

    // Also include the team owner in the list as the Admin role
    const owner = await this.prisma.user.findUnique({
      where: { id: team.ownerId },
      include: { wallet: true },
    });

    const list: TeamMemberDto[] = [];

    if (owner) {
      list.push({
        userId: owner.id,
        username: owner.username,
        email: owner.email,
        role: 'Owner',
        allocatedQuota: owner.wallet?.dailyLimitTokens ?? 500_000,
        usedTokens: owner.wallet?.usedTodayTokens ?? 0,
        joinedAt: team.createdAt.toISOString(),
      });
    }

    for (const m of members) {
      if (m.userId === team.ownerId) continue; // Skip duplicate of owner
      list.push({
        userId: m.user.id,
        username: m.user.username,
        email: m.user.email,
        role: 'Member',
        allocatedQuota: m.user.wallet?.dailyLimitTokens ?? 100_000,
        usedTokens: m.user.wallet?.usedTodayTokens ?? 0,
        joinedAt: m.joinedAt.toISOString(),
      });
    }

    return list;
  }
}
