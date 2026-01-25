import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { LearningService } from "../services/learning.service";
import { UpdateProgressDto } from "src/schema/dtos/update-progress.dto";
import { RolesGuard } from "src/common/guards/roles.guard";
import { SystemRole } from "src/schema/entities/role.entity";
import { Roles } from "src/common/guards/roles.decorator";

@Controller("learning")
@UseGuards(JwtAuthGuard, RolesGuard)
export class LearningController {
  constructor(private learningService: LearningService) {}

  @Post("progress")
  @Roles(SystemRole.STUDENT)
  @HttpCode(200)
  async updateProgress(@Req() req: any, @Body() dto: UpdateProgressDto) {
    const userId = (req as any).user.id;
    return this.learningService.updateProgress(userId, dto);
  }

  @Get("course/:courseId/resume")
  @Roles(SystemRole.STUDENT)
  async getLastWatchedLesson(
    @Req() req: Request,
    @Param("courseId") courseId: string
  ) {
    const userId = (req as any).user.id;
    return await this.learningService.getLastWatchedLesson(userId, courseId);
  }

  @Get("progress/:courseId")
  @Roles(SystemRole.STUDENT)
  @HttpCode(200)
  async getCourseProgress(
    @Req() req: Request,
    @Param("courseId") courseId: string
  ) {
    const userId = (req as any).user.id;
    return this.learningService.getCourseProgress(userId, courseId);
  }

  @Get("progress")
  @Roles(SystemRole.STUDENT)
  @HttpCode(200)
  async getOverallProgress(@Req() req: Request) {
    const userId = (req as any).user.id;
    return this.learningService.getOverallProgress(userId);
  }
}
