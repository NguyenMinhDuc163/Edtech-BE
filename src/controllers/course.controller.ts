import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards, UseInterceptors, UploadedFile, Query, Patch, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/guards/roles.decorator';
import { SystemRole } from '../schema/entities/role.entity';
import { CourseService } from '../services/course.service';
import { StorageService } from '../services/storage.service';
import { CourseVisibility, CourseStatus } from '../schema/entities/course.entity';
import { Request } from 'express';
import { QuizResultService } from '../services/quiz-result.service';
import { STORAGE_CONTAINERS } from '../constants/storage';
import { AICourseService } from '../services/ai-course.service';
import { AIGenerateCourseDto } from '../schema/dtos/ai-generate-course.dto';
import { AIImportCourseDto } from '../schema/dtos/ai-import-course.dto';
import { AISyllabusResponse } from '../schema/dtos/ai-syllabus-response.dto';
import * as path from 'path';

@Controller("courses")
export class CourseController {
  constructor(
    private readonly courseService: CourseService,
    private readonly storageService: StorageService,
    private readonly quizResultService: QuizResultService,
    private readonly aiCourseService: AICourseService,
  ) { }

  @Post('list')
  @HttpCode(200)
  async getCoursesList(
    @Body() body: { type: string; limit?: number }
  ) {
    const limit = body.limit && body.limit > 0 ? Math.min(body.limit, 100) : 20;
    return this.courseService.getCoursesByType(body.type, limit);
  }

  @Get("/categories-summary")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async getCategorySummary() {
    return this.courseService.getCategorySummary();
  }

  @Post()
  @HttpCode(201)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.TEACHER, SystemRole.ADMIN)
  @UseInterceptors(FileInterceptor('thumbnail'))
  async create(
    @Body() body: any,
    @UploadedFile() thumbnail: any,
    @Req() req: Request
  ) {
    const ownerId = (req as any).user?.id ?? null;

    const dto: any = {
      title: body.title,
      description: body.description,
      category: body.category,
      price: parseFloat(body.price),
      currency: body.currency,
      visibility: body.visibility || CourseVisibility.PUBLIC,
      status: body.status || CourseStatus.APPROVED,
      courseDuration: body.courseDuration,
      teacher: body.teacher,
      courseDescription: body.courseDescription,
      thumbnailUrl: body.thumbnailUrl || null,
    };
    if (body.discountAmount) dto.discountAmount = parseFloat(body.discountAmount);

    const created = await this.courseService.create(dto, ownerId);
    const courseId = String(created.course_id);

    if (thumbnail) {
      const extension = path.extname(thumbnail.originalname);
      const newFilename = `thumbnail_${courseId}${extension}`;
      const result = await this.storageService.upload(
        thumbnail.buffer,
        newFilename,
        thumbnail.mimetype,
        STORAGE_CONTAINERS.THUMBNAILS
      );
      await this.courseService.updateThumbnailUrl(courseId, result.url);
    }

    return { courseId, status: created.status };
  }

  @Patch(':courseId/visibility')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.TEACHER, SystemRole.ADMIN) // giống hệt cách bạn dùng ở trên
  async changeVisibility(
    @Param('courseId') courseId: string,
    @Body('visibility') visibility: 'PUBLIC' | 'PRIVATE',
    @Req() req: Request & { user: { id: string } },
  ) {
    if (!visibility) {
      throw new BadRequestException('Trường "visibility" là bắt buộc');
    }

    if (!['PUBLIC', 'PRIVATE'].includes(visibility)) {
      throw new BadRequestException('visibility chỉ được phép là PUBLIC hoặc PRIVATE');
    }

    const ownerId = (req as any).user?.id ?? null;

    const updated = await this.courseService.changeCourseVisibility(
      courseId,
      visibility as CourseVisibility,
      ownerId,
    );

    return {
      success: true,
      data: {
        course_id: updated.course_id,
        title: updated.title,
        visibility: updated.visibility,
        updated_at: updated.updated_at,
      },
    };
  }

  @Get('purchased/list')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.STUDENT)
  async listPurchased(@Req() req: Request) {
    const userId = (req as any).user?.id ?? null;
    const courses = await this.courseService.getPurchasedCourses(userId);
    return courses;
  }

  @Get('leaderboard')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.STUDENT, SystemRole.TEACHER)
  async getTopStudents(
    @Query('courseId') courseId?: string,
    @Query('quizId') quizId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    const query: {
      courseId?: string;
      quizId?: string;
      page?: number;
      limit?: number;
    } = {};
    if (courseId) query.courseId = courseId;
    if (quizId) query.quizId = quizId;
    if (page) query.page = page;
    if (limit) query.limit = limit;
    return this.quizResultService.getTopStudents(query);
  }

  @Get()
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.TEACHER)
  async listMine(@Req() req: Request) {
    const ownerId = (req as any).user?.id ?? null;
    const items = await this.courseService.listMyCourses(ownerId);
    return items;
  }

  @Post(":courseId")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.TEACHER)
  @UseInterceptors(FileInterceptor('thumbnail'))
  async update(
    @Param('courseId') courseId: string,
    @Body() body: any,
    @UploadedFile() thumbnail: any,
    @Req() req: Request
  ) {
    const ownerId = (req as any).user?.id ?? null;

    let thumbnailUrl: string | undefined;
    if (thumbnail) {
      const extension = path.extname(thumbnail.originalname);
      const newFilename = `thumbnail_${courseId}${extension}`;
      const result = await this.storageService.upload(
        thumbnail.buffer,
        newFilename,
        thumbnail.mimetype,
        STORAGE_CONTAINERS.THUMBNAILS
      );
      thumbnailUrl = result.url;
    }

    const dto: any = {};
    if (body.title) dto.title = body.title;
    if (body.description !== undefined) dto.description = body.description;
    if (body.category !== undefined) dto.category = body.category;
    if (body.price) dto.price = parseFloat(body.price);
    if (body.currency) dto.currency = body.currency;
    if (body.visibility) dto.visibility = body.visibility;
    if (body.courseDuration !== undefined) dto.courseDuration = body.courseDuration;
    if (body.teacher !== undefined) dto.teacher = body.teacher;
    if (body.discountAmount !== undefined) dto.discountAmount = parseFloat(body.discountAmount);
    if (body.courseDescription !== undefined) dto.courseDescription = body.courseDescription;
    if (thumbnailUrl) dto.thumbnailUrl = thumbnailUrl;
    else if (body.thumbnailUrl !== undefined) dto.thumbnailUrl = body.thumbnailUrl;

    const updated = await this.courseService.update(courseId, ownerId, dto);
    return { courseId: String(updated.course_id) };
  }

  @Post(':courseId/submit')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.TEACHER)
  async submitForApproval(
    @Param("courseId") courseId: string,
    @Req() req: Request
  ) {
    const ownerId = (req as any).user?.id ?? null;
    const result = await this.courseService.submitForApproval(courseId, ownerId);
    return result;
  }

  @Get(":courseId")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.TEACHER, SystemRole.ADMIN)
  async detail(@Param("courseId") courseId: string) {
    return await this.courseService.getDetail(courseId);
  }
  @Get('count/public-approved')
  @HttpCode(200)
  async countPublicApprovedCourses() {
    const total = await this.courseService.countPublicApprovedCourses();
    return {
      total,
    };
  }
  @Post('ai/preview')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.TEACHER, SystemRole.ADMIN)
  async previewCourseFromAI(
    @Body() dto: AIGenerateCourseDto,
  ): Promise<{
    status: number;
    message: string;
    data: AISyllabusResponse;
  }> {
    const syllabus = await this.aiCourseService.previewCourseFromAI(
      dto.instruction,
    );

    return {
      status: 200,
      message: 'AI syllabus preview generated successfully',
      data: syllabus,
    };
  }
  @Post('ai/import')
  @HttpCode(201)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.TEACHER, SystemRole.ADMIN)
  async importCourseFromAI(
    @Body() dto: AIImportCourseDto,
    @Req() req: Request,
  ) {
    const teacherId = (req as any).user?.id ?? null;

    if (!teacherId) {
      throw new BadRequestException('Teacher not found in token');
    }

    return this.aiCourseService.importFromSyllabus(
      {
        syllabus: dto.syllabus,
        thumbnail_url: dto.thumbnail_url, 
      },
      teacherId,
    );
  }
}
