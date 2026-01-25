import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  HttpCode,
} from "@nestjs/common";
import { JwtAuthGuard } from "src/common/guards/jwt-auth.guard";
import { Roles } from "src/common/guards/roles.decorator";
import { RolesGuard } from "src/common/guards/roles.guard";
import { FilterTeacherStatDto } from "src/schema/dtos/filter-results.dto";
import { SystemRole } from "src/schema/entities/role.entity";
import { TeacherStatisticsService } from "src/services/teacher-statistics.service";
import { Response } from "express";

@Controller("teacher/courses")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(SystemRole.TEACHER)
export class TeacherStatisticsController {
  constructor(private readonly teacherStatsService: TeacherStatisticsService) {}

  @Get("stats")
  @HttpCode(200)
  async getTeacherStatistics(
    @Req() req: Request,
    @Query() filter: FilterTeacherStatDto
  ) {
    const teacherId = (req as any).user?.id ?? null;
    return this.teacherStatsService.getTeacherStatistics(teacherId, filter);
  }

  @Get(":courseId/export")
  @HttpCode(200)
  @Roles(SystemRole.TEACHER)
  async exportCourseReport(
    @Req() req: Request,
    @Param("courseId") courseId: string,
    @Res() res: Response
  ) {
    const teacherId = (req as any).user?.id ?? null;
    const buffer = await this.teacherStatsService.exportTeacherCourseReport(
      teacherId, courseId
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="course_${courseId}_report.xlsx"`
    );
    res.send(buffer);
  }
}
