import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  Post,
  Body,
  HttpCode,
} from "@nestjs/common";
import { JwtAuthGuard } from "src/common/guards/jwt-auth.guard";
import { Roles } from "src/common/guards/roles.decorator";
import { RolesGuard } from "src/common/guards/roles.guard";
import { FilterResultsDto } from "src/schema/dtos/filter-results.dto";
import { LeaderboardQueryDto } from "src/schema/dtos/leaderboard-query.dto";
import { SystemRole } from "src/schema/entities/role.entity";
import { QuizResultService } from "src/services/quiz-result.service";

@Controller("admin/courses")
@UseGuards(JwtAuthGuard, RolesGuard)
export class QuizResultController {
  constructor(private readonly quizResultService: QuizResultService) {}

  @Post("result")
  @HttpCode(200)
  @Roles(SystemRole.ADMIN, SystemRole.TEACHER)
  async getResults(
    @Query("page") page: Number,
    @Query("limit") limit: Number,
    @Body() filter: FilterResultsDto
  ) {
    return this.quizResultService.getResults({ page, limit, ...filter });
  }

  @Get("leaderboard")
  @HttpCode(200)
  @Roles(SystemRole.ADMIN)
  async getLeaderboard(@Query() query: LeaderboardQueryDto): Promise<any> {
    return this.quizResultService.getLeaderboard(query);
  }
}
