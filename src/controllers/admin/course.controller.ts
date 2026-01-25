import {
  Controller,
  Get,
  HttpCode,
  Param,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "src/common/guards/jwt-auth.guard";
import { Roles } from "src/common/guards/roles.decorator";
import { RolesGuard } from "src/common/guards/roles.guard";
import { AdminGetCoursesDto } from "src/schema/dtos/admin-get-courses.dto";
import { SystemRole } from "src/schema/entities/role.entity";
import { CourseService } from "src/services/course.service";
import { Response } from "express";

@Controller("admin/courses")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminCourseController {
  constructor(private readonly courseService: CourseService) {}

  @Get()
  @HttpCode(200)
  @Roles(SystemRole.ADMIN)
  async getCoursesByAdmin(@Query() query: AdminGetCoursesDto) {
    return this.courseService.getAdminCourses(query);
  }

  @Get(":courseId/export")
  @Roles(SystemRole.ADMIN)
  async exportCourseReport(
    @Param("courseId") courseId: string,
    @Res() res: Response
  ) {
    const buffer = await this.courseService.exportAdminCourseReport(courseId);
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
