import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/guards/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  MobileIapPlatformDto,
  MobileIapSyncDto,
} from '../schema/dtos/mobile-iap.dto';
import { SystemRole } from '../schema/entities/role.entity';
import { IapPurchaseService } from '../services/iap-purchase.service';

@Controller('api/mobile-iap')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(SystemRole.STUDENT)
export class MobileIapController {
  constructor(private readonly iapPurchaseService: IapPurchaseService) {}

  @Get('config')
  @HttpCode(200)
  async getConfig(@Query() query: MobileIapPlatformDto, @Req() req: Request) {
    const userId = (req as any).user.id;
    return this.iapPurchaseService.getConfig(userId, query.platform);
  }

  @Post('sync')
  @HttpCode(200)
  async sync(@Body() dto: MobileIapSyncDto, @Req() req: Request) {
    const userId = (req as any).user.id;
    return this.iapPurchaseService.syncUserPurchases(userId, dto);
  }

  @Get('status/:courseId')
  @HttpCode(200)
  async getStatus(@Param('courseId') courseId: string, @Req() req: Request) {
    const userId = (req as any).user.id;
    return this.iapPurchaseService.getCourseStatus(userId, courseId);
  }
}
