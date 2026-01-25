import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
  HttpCode,
  Logger,
} from "@nestjs/common";
import { QuizService } from "../../services/quiz.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/guards/roles.decorator";
import { SystemRole } from "../../schema/entities/role.entity";
import { GetQuizzesDto } from "../../schema/dtos/get-quizzes.dto";
import { GetQuizDetailDto } from "../../schema/dtos/get-quiz-detail.dto";
import { SubmitQuizDto } from "../../schema/dtos/submit-quiz.dto";
import { MasteryService } from "src/services/mastery.service";
import { firstValueFrom } from "rxjs";
import { HttpService } from "@nestjs/axios";
import { SystemParameterService } from "src/services/system-parameter.service";

@Controller("student/quiz")
@UseGuards(JwtAuthGuard, RolesGuard)
export class StudentQuizController {
  constructor(
    private readonly quizService: QuizService,
    private readonly masteryService: MasteryService,
    private readonly httpService: HttpService,
    private systemParameterService: SystemParameterService,
  ) { }

  @Post("list")
  @HttpCode(200)
  @Roles(SystemRole.STUDENT)
  async getQuizzes(@Body() getQuizzesDto: GetQuizzesDto, @Req() req: any) {
    const studentId = req.user.id;
    const quizzes = await this.quizService.getPublishedQuizzesForStudent(
      studentId,
      getQuizzesDto.course_id,
      getQuizzesDto.section_id,
      getQuizzesDto.lesson_id
    );

    return quizzes;
  }

  @Post("detail")
  @HttpCode(200)
  @Roles(SystemRole.STUDENT)
  async getQuizDetail(
    @Body() getQuizDetailDto: GetQuizDetailDto,
    @Req() req: any
  ) {
    const studentId = req.user.id;
    const quizDetail = await this.quizService.getQuizDetailForStudent(
      getQuizDetailDto.quiz_id,
      studentId
    );

    return quizDetail;
  }

  @Post("submit")
  @HttpCode(200)
  @Roles(SystemRole.STUDENT)
  async submitQuiz(@Body() submitQuizDto: SubmitQuizDto, @Req() req: any) {
    const studentId = req.user.id;
    let adaptiveSuggestion = null;
    const result = await this.quizService.submitQuizForStudent(
      submitQuizDto,
      studentId
    );

    if (result.targetContentId) {
      try {
        const payload = await this.masteryService.buildAiPayload(
          studentId,
          String(result.targetContentId),
          result.currentTheta
        );

        if (payload) {
          const aiServiceUrl = await this.systemParameterService.getValue('ADAPTIVE_SERVER_URL', 'https://ai.nguyenduc.click/adaptive');
          const response = await firstValueFrom(
            this.httpService.post(aiServiceUrl, payload)
          );

          if (response.data) {
            adaptiveSuggestion = await this.masteryService.formatAiSuggestion(
              response.data
            );
          }
        }
      } catch (error) {
        adaptiveSuggestion = null;
      }
    }

    return {
      ...result,
      adaptiveSuggestion: adaptiveSuggestion,
    };
  }

  @Post("history")
  @HttpCode(200)
  @Roles(SystemRole.STUDENT)
  async getHistory(
    @Body() getQuizDetailDto: GetQuizDetailDto,
    @Req() req: any
  ) {
    const studentId = req.user.id;
    return this.quizService.getQuizHistoryForStudent(
      getQuizDetailDto.quiz_id,
      studentId
    );
  }
}
