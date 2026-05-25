import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes, createHash } from 'crypto';

export interface UserDto {
  id: string;
  email: string;
  username: string;
  role: string;
  createdAt: string;
}

export interface ApiKeyDto {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<UserDto | null> {
    this.logger.debug(`Finding user by id: ${id}`);
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async findByEmail(email: string): Promise<UserDto | null> {
    this.logger.debug(`Finding user by email: ${email}`);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async listAll(): Promise<UserDto[]> {
    this.logger.debug('Listing all users');
    const users = await this.prisma.user.findMany();
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      username: u.username,
      role: u.role,
      createdAt: u.createdAt.toISOString(),
    }));
  }

  async update(id: string, data: Partial<UserDto>): Promise<UserDto | null> {
    this.logger.log(`Updating user ${id}`);
    const updateData: any = {};
    if (data.email) updateData.email = data.email;
    if (data.username) updateData.username = data.username;
    
    const user = await this.prisma.user.update({
      where: { id },
      data: updateData,
    });
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async deactivate(id: string): Promise<boolean> {
    this.logger.log(`Deactivating user ${id}`);
    // In this simple model we can just remove their active api keys
    await this.prisma.apiKey.updateMany({
      where: { userId: id },
      data: { isActive: false },
    });
    return true;
  }

  // ── API Key Management ─────────────────────────────────

  async generateApiKey(userId: string, name: string): Promise<{ name: string; rawKey: string }> {
    this.logger.log(`Generating API Key '${name}' for user ${userId}`);
    
    // Generate secure random key
    const randomSeg = randomBytes(24).toString('hex');
    const rawKey = `costops_key_${randomSeg}`;
    
    // Hash key with SHA-256
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    
    await this.prisma.apiKey.create({
      data: {
        userId,
        name,
        keyHash,
        isActive: true,
      },
    });

    return {
      name,
      rawKey,
    };
  }

  async listApiKeys(userId: string): Promise<ApiKeyDto[]> {
    this.logger.debug(`Listing active API keys for user ${userId}`);
    const keys = await this.prisma.apiKey.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      isActive: k.isActive,
      createdAt: k.createdAt.toISOString(),
    }));
  }

  async revokeApiKey(userId: string, keyId: string): Promise<boolean> {
    this.logger.log(`Revoking API Key ${keyId} for user ${userId}`);
    
    const key = await this.prisma.apiKey.findFirst({
      where: { id: keyId, userId },
    });

    if (!key) {
      throw new NotFoundException('API Key not found or belongs to another user');
    }

    await this.prisma.apiKey.delete({
      where: { id: keyId },
    });

    return true;
  }
}
