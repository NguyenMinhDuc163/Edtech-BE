import {
  Controller,
  Get,
  Param,
  Query,
  HttpCode,
  Req,
  UseGuards,
  BadRequestException
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/guards/roles.decorator';
import { SystemRole } from '../schema/entities/role.entity';
import { RecommendationService } from '../services/recommendation.service';
import { Request } from 'express';

@Controller('recommendations')
export class RecommendationController {
  constructor(private readonly service: RecommendationService) {}


  @Get('hybrid/me')
  @HttpCode(200)
  @UseGuards(OptionalJwtAuthGuard)
  async getMyRecommendations(
    @Req() req: any,
    @Query('limit') limit?: string,
  ) {
    const userId = req.user?.id || null;
    const limitNum = limit ? Math.min(Math.max(1, parseInt(limit, 10)), 50) : 10;
    return this.service.getHybridRecommendations(userId, limitNum);
  }

  @Get('hybrid/:userId')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.STUDENT, SystemRole.TEACHER, SystemRole.ADMIN)
  async getHybrid(
    @Param('userId') userId: string,
    @Req() req: Request,
    @Query('limit') limit?: string,
  ) {
    const currentUserId = (req as any).user?.id;
    if (currentUserId !== userId) {
      throw new BadRequestException('You can only get recommendations for yourself');
    }

    const limitNum = limit
      ? Math.min(Math.max(1, parseInt(limit, 10)), 50)
      : 10;

    return await this.service.getHybridRecommendations(userId, limitNum);
  }


  @Get('popular')
  @HttpCode(200)
  async getPopularPublic(
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit
      ? Math.min(Math.max(1, parseInt(limit, 10)), 50)
      : 10;

    return await this.service.getPopularCourses(limitNum);
  }

  @Get('lastest')
  @HttpCode(200)
  async getLatestCourses(
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit
      ? Math.min(Math.max(1, parseInt(limit, 10)), 50)
      : 10;

    return await this.service.getLatestCourses(limitNum);
  }
}

