import {
  Controller,
  Post,
  Param,
  Body,
  Get,
  Req,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { ApproveService } from '../../services/approve.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/guards/roles.decorator';
import { SystemRole } from '../../schema/entities/role.entity';
import { Request } from 'express';

@Controller('admin/approvals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApproveController {
  constructor(private readonly approveService: ApproveService) {}

  // 🟢 Lấy danh sách khóa học chờ duyệt
  @Get('pending')
  @HttpCode(200)
  @Roles(SystemRole.ADMIN)
  async listPending() {
    const pending = await this.approveService.listPendingCourses();
    return { code: 200, message: 'OK', data: pending };
  }

  // ✅ Phê duyệt khóa học
  @Post(':courseId/approve')
  @HttpCode(200)
  @Roles(SystemRole.ADMIN)
  async approve(@Param('courseId') courseId: string, @Req() req: Request) {
    const adminId = (req as any).user?.id;
    const result = await this.approveService.approveCourse(courseId, adminId);
    return { code: 200, message: 'Approved', data: result };
  }

  // ❌ Từ chối khóa học
  @Post(':courseId/reject')
  @HttpCode(200)
  @Roles(SystemRole.ADMIN)
  async reject(
    @Param('courseId') courseId: string,
    @Body('reason') reason: string,
    @Req() req: Request,
  ) {
    const adminId = (req as any).user?.id;
    const result = await this.approveService.rejectCourse(courseId, adminId, reason);
    return { code: 200, message: 'Rejected', data: result };
  }

  // 📜 Lịch sử phê duyệt của 1 khóa học
  @Get(':courseId/history')
  @HttpCode(200)
  @Roles(SystemRole.ADMIN)
  async getHistory(@Param('courseId') courseId: string) {
    const history = await this.approveService.getApprovalHistory(courseId);
    return { code: 200, message: 'OK', data: history };
  }
}
