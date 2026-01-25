import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { RefreshToken } from "../schema/entities/refresh-token.entity";
import { SystemParameterService } from "../services/system-parameter.service";
import * as bcrypt from "bcrypt";

@Injectable()
export class RefreshTokenService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private systemParameterService: SystemParameterService
  ) {}

  async create(
    userId: string,
    refreshToken: string,
    deviceInfo?: string,
    ip?: string
  ): Promise<void> {
    const tokenHash = await bcrypt.hash(refreshToken, 10);
    const refreshTime = await this.systemParameterService.getValue('REFRESH_TIME', '604800');
    console.log('REFRESH_TIME from DB (create):', refreshTime);
    const expiresAt = new Date(Date.now() + parseInt(refreshTime) * 1000);

    const rt = this.refreshTokenRepo.create({
      userId,
      tokenHash,
      deviceInfo: deviceInfo || "unknown",
      ip: ip || "unknown",
      expiresAt,
    });

    await this.refreshTokenRepo.save(rt);
  }

  async validate(userId: string, refreshToken: string): Promise<boolean> {
    const tokens = await this.refreshTokenRepo.find({
      where: { userId },
    });

    for (const t of tokens) {
      const match = await bcrypt.compare(refreshToken, t.tokenHash);
      if (match && t.expiresAt > new Date()) {
        return true;
      }
    }
    return false;
  }

  async revokeOne(userId: string, refreshToken: string): Promise<void> {
    const tokens = await this.refreshTokenRepo.find({ where: { userId } });

    for (const t of tokens) {
      const match = await bcrypt.compare(refreshToken, t.tokenHash);
      if (match) {
        await this.refreshTokenRepo.delete(t.id);
        return;
      }
    }
  }

  async revokeAll(userId: string): Promise<void> {
    await this.refreshTokenRepo.delete({ userId });
  }

  async removeExpiredTokens(userId: string): Promise<void> {
    const tokens = await this.refreshTokenRepo.find({ where: { userId } });
    const expiredTokenIds = tokens
      .filter(t => t.expiresAt <= new Date())
      .map(t => t.id);

    if (expiredTokenIds.length > 0) {
      await this.refreshTokenRepo.delete(expiredTokenIds);
      console.log(`Removed ${expiredTokenIds.length} expired tokens for user ${userId}`);
    }
  }

  async limitUserTokens(userId: string, maxTokens: number = 5): Promise<void> {
    const tokens = await this.refreshTokenRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' }
    });

    if (tokens.length > maxTokens) {
      const tokensToRemove = tokens.slice(maxTokens);
      const idsToRemove = tokensToRemove.map(t => t.id);
      await this.refreshTokenRepo.delete(idsToRemove);
      console.log(`Removed ${idsToRemove.length} old tokens for user ${userId}`);
    }
  }

  async rotateToken(
    userId: string,
    oldRefreshToken: string,
    newRefreshToken: string,
    deviceInfo?: string,
    ip?: string
  ): Promise<void> {
    await this.revokeOne(userId, oldRefreshToken);
    await this.create(userId, newRefreshToken, deviceInfo, ip);
  }
}
