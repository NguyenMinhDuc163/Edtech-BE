
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  HttpCode,
  UseGuards,
  BadRequestException,
  Query,
  ForbiddenException,
  Patch,
  Delete,
} from '@nestjs/common';
import {
  IsString,
  IsNotEmpty,
  IsObject,
  ValidateNested,
  IsArray,
  validateOrReject,
  ValidationError,
} from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PendingChangeService } from '../services/pending-change.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/guards/roles.decorator';
import { SystemRole } from '../schema/entities/role.entity';
import { Request } from 'express';
import { BulkAddSectionsDto } from '../schema/dtos/bulk-add-sections.dto';
import { BatchPendingChangeDto } from 'src/schema/dtos/batch-pending-change.dto';

@Controller('pending-changes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PendingChangeController {
  constructor(private readonly pendingChangeService: PendingChangeService) {}

  // === CREATE PENDING CHANGE ===
  @Post()
  @HttpCode(201)
  @Roles(SystemRole.TEACHER)
  async createPendingChange(
    @Body() body: { courseId: string; changeData: any },
    @Req() req: Request,
  ) {
    const teacherId = (req as any).user?.id;
    const { courseId, changeData } = body;

    if (!courseId) throw new BadRequestException('courseId is required');
    if (!changeData || typeof changeData !== 'object')
      throw new BadRequestException('changeData must be an object');

    let payload = changeData;

    // XỬ LÝ BULK_ADD_SECTIONS
    if ('sections' in changeData && Array.isArray(changeData.sections)) {
      const bulkDto = plainToInstance(BulkAddSectionsDto, { sections: changeData.sections });
      try {
        await validateOrReject(bulkDto);
      } catch (errors: unknown) {
        if (Array.isArray(errors)) {
          const messages = (errors as ValidationError[])
            .map((e: ValidationError) => Object.values(e.constraints || {}).join(', '))
            .filter(Boolean)
            .join('; ');
          throw new BadRequestException(`Validation failed: ${messages}`);
        }
        throw new BadRequestException('Invalid request data');
      }

      await this.pendingChangeService.validateBulkSections(courseId, teacherId, changeData.sections);

      payload = {
        type: 'BULK_ADD_SECTIONS',
        data: changeData.sections,
      };
    }

    const result = await this.pendingChangeService.createPendingChange(teacherId, courseId, payload);

    return { code: 201, message: 'Pending change created', data: result };
  }

  @Get(':id')
  @HttpCode(200)
  @Roles(SystemRole.TEACHER, SystemRole.ADMIN)
  async getPendingChangeById(@Param('id') id: string, @Req() req: Request) {
    const userId = (req as any).user.id;
    const role = (req as any).user.role;

    const pending = await this.pendingChangeService.getPendingChangeDetail(id);

    if (role !== SystemRole.ADMIN && pending.submittedBy.id !== userId) {
      throw new ForbiddenException('Bạn không có quyền xem bản thay đổi này');
    }

    return { code: 200, message: 'OK', data: pending };
  }

  // === DELETE PENDING CHANGE ===
  @Delete(':id')
  @HttpCode(200)
  @Roles(SystemRole.TEACHER)
  async deletePendingChange(@Param('id') id: string, @Req() req: Request) {
    const teacherId = (req as any).user?.id;

    try {
      await this.pendingChangeService.deletePendingChange(id, teacherId);
      return { code: 200, message: 'Pending change deleted' };
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        throw error;
      } else if (error instanceof ForbiddenException) {
        throw error;
      } else {
        throw new BadRequestException(error.message || 'Failed to delete pending change');
      }
    }
  }
  
  // === SUBMIT PENDING CHANGE ===
  @Post(':id/submit')
  @HttpCode(200)
  @Roles(SystemRole.TEACHER)
  async submitPendingChange(@Param('id') id: string, @Req() req: Request) {
    const teacherId = (req as any).user?.id;

    try {
      const data = await this.pendingChangeService.submitPendingChange(id, teacherId);
      return { 
        code: 200, 
        message: 'Đã gửi duyệt thành công', 
        data 
      };
    } catch (error) {
      throw error;
    }
  }

  // === APPROVE (ADMIN) ===
  @Post('admin/:id/approve')
  @HttpCode(200)
  @Roles(SystemRole.ADMIN)
  async approvePendingChange(@Param('id') id: string, @Req() req: Request) {
    const adminId = (req as any).user?.id;
    const result = await this.pendingChangeService.approvePendingChange(id, adminId);
    return { code: 200, message: 'Approved', data: result };
  }

  // === REJECT (ADMIN) ===
  @Post('admin/:id/reject')
  @HttpCode(200)
  @Roles(SystemRole.ADMIN)
  async rejectPendingChange(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Req() req: Request,
  ) {
    if (!reason) throw new BadRequestException('reason is required');
    const adminId = (req as any).user?.id;
    const result = await this.pendingChangeService.rejectPendingChange(id, adminId, reason);
    return { code: 200, message: 'Rejected', data: result };
  }

  // === GET ALL (ADMIN) ===
  @Get('admin/all')
  @HttpCode(200)
  @Roles(SystemRole.ADMIN)
  async getAllPendingChanges() {
    const data = await this.pendingChangeService.getAllPendingChanges();
    return { code: 200, message: 'OK', data };
  }

  // === GET DETAIL (ADMIN) ===
  @Get('admin/:id')
  @HttpCode(200)
  @Roles(SystemRole.ADMIN)
  async getPendingChangeDetail(@Param('id') id: string) {
    const data = await this.pendingChangeService.getPendingChangeDetail(id);
    return { code: 200, message: 'OK', data };
  }

  // === GET MY PENDING CHANGES (TEACHER) ===
  @Get('teacher/my')
  @HttpCode(200)
  @Roles(SystemRole.TEACHER)
  async getTeacherPendingChanges(@Req() req: Request & { user: { id: string } }) {
    const teacherId = req.user.id;
    const data = await this.pendingChangeService.getPendingChangesByUser(teacherId);
    return { code: 200, message: 'OK', data };
  }

  // === GET BY COURSE ID (TEACHER & ADMIN) ===
  @Get('course/:courseId/history')
  @HttpCode(200)
  @Roles(SystemRole.TEACHER, SystemRole.ADMIN)
  async getHistoryByCourseId(
    @Param('courseId') courseId: string,
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('includeDraft') includeDraft?: 'true' | 'false',
  ) {
    const userId = (req as any).user.id;
    const role = (req as any).user.role;
    const includeDraftBool = includeDraft === 'true' ;

    const result = await this.pendingChangeService.getPendingChangesByCourseId(
      courseId,
      userId,
      role,
      {
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 20,
        includeDraft: role === SystemRole.ADMIN ? includeDraftBool : true,
        
      }
    );

    return {
      code: 200,
      message: 'OK',
      data: result.data,
      pagination: {
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 20,
        total: result.total,
      },
    };
  }

  @Post(':id/resubmit')
  @HttpCode(200)
  @Roles(SystemRole.TEACHER)
  async resubmitRejectedChange(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const teacherId = (req as any).user?.id;
    const result = await this.pendingChangeService.resubmitRejectedChange(id, teacherId);
    return { code: 200, message: 'Đã mở lại để chỉnh sửa', data: result };
  }

  @Patch(':id/section/:tempId')
  @HttpCode(200)
  @Roles(SystemRole.TEACHER)
  async updateSection(@Param('id') id: string, @Param('tempId') tempId: string, @Body() body: any, @Req() req: Request) {
    const teacherId = (req as any).user.id;
    return this.pendingChangeService.updateSectionInDraft(id, teacherId, tempId, body);
  }

  @Patch(':id/lesson/:tempId')
  @HttpCode(200)
  @Roles(SystemRole.TEACHER)
  async updateLesson(@Param('id') id: string, @Param('tempId') tempId: string, @Body() body: any, @Req() req: Request) {
    const teacherId = (req as any).user.id;
    return this.pendingChangeService.updateLessonInDraft(id, teacherId, tempId, body);
  }

  @Post('batch/approve')
  @HttpCode(200)
  @Roles(SystemRole.ADMIN)
  async batchApprove(
    @Body() dto: BatchPendingChangeDto,
    @Req() req: Request & { user: { id: string } },
  ) {
    if (!dto.pendingChangeIds || !Array.isArray(dto.pendingChangeIds) || dto.pendingChangeIds.length === 0) {
      throw new BadRequestException('pendingChangeIds is required and must be a non-empty array');
    }
    const result = await this.pendingChangeService.batchApprove(dto.pendingChangeIds, req.user.id);
    return {
      message: `Batch approve completed`,
      approved: result.success.length,
      failed: result.failed.length,
      details: result,
    };
  }

  @Post('batch/reject')
  @HttpCode(200)
  @Roles(SystemRole.ADMIN)
  async batchReject(
    @Body() dto: BatchPendingChangeDto & { reason: string },
    @Req() req: Request & { user: { id: string } },
  ) {
    if (!dto.pendingChangeIds || !Array.isArray(dto.pendingChangeIds) || dto.pendingChangeIds.length === 0) {
      throw new BadRequestException('pendingChangeIds is required and must be a non-empty array');
    }
    if (!dto.reason?.trim()) {
      throw new BadRequestException('Reason is required for batch reject');
    }

    const result = await this.pendingChangeService.batchReject(
      dto.pendingChangeIds,
      req.user.id,
      dto.reason.trim()
    );

    return {
      message: `Batch reject completed`,
      rejected: result.success.length,
      failed: result.failed.length,
      details: result,
    };
  }

}

