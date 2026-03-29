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
// import { firstValueFrom } from "rxjs";
// import { HttpService } from "@nestjs/axios";
// import { SystemParameterService } from "src/services/system-parameter.service";
import { AI_PROVIDER } from "src/config/ai-provider";
import { buildAdaptiveMessages, AdaptiveContext } from "src/utils/prompt-builder";

@Controller("student/quiz")
@UseGuards(JwtAuthGuard, RolesGuard)
export class StudentQuizController {
  constructor(
    private readonly quizService: QuizService,
    private readonly masteryService: MasteryService,
    // private readonly httpService: HttpService,
    // private systemParameterService: SystemParameterService,
  ) { }

  // ── Gọi third-party AI theo OpenAI-compatible format ──────────────────────
  // Tương đương /adaptive endpoint trong notebook (adaptive_predict).
  // Notebook: gọi adaptive_model.generate() → parse JSON → resolve TargetID.
  // Giờ: build messages từ payload → gọi router.ndtech.io.vn → parse JSON response.
  private async callAdaptiveAI(payload: NonNullable<Awaited<ReturnType<MasteryService['buildAiPayload']>>>): Promise<any> {
    const kg = payload.knowledge_graph_subgraph;
    const profile = payload.user_mastery_profile;
    const ctx = payload.current_context;

    const currId = String(ctx.target_content_id);
    const currTheta = ctx.current_theta;

    const profileMap = new Map(profile.map((p) => [String(p.content_id), p]));
    const currInfo = profileMap.get(currId);
    const currTitle = currInfo?.title ?? `Lesson ${currId}`;

    let currDesc = 'Không có mô tả nội dung.';
    for (const e of kg) {
      if (String(e.target_id) === currId && e.description_target) {
        currDesc = e.description_target;
        break;
      }
      if (String(e.source_id) === currId && e.description_source) {
        currDesc = e.description_source;
        break;
      }
    }

    const prereqLines: string[] = [];
    for (const e of kg) {
      if (String(e.target_id) === currId && e.type === 'PREREQUISITE') {
        const srcId = String(e.source_id);
        const pTheta = profileMap.get(srcId)?.theta ?? 0;
        const status = pTheta < 0 ? 'HỔNG KIẾN THỨC' : 'NẮM VỮNG';
        prereqLines.push(
          `- Bài: ${e.source} (ID: ${srcId})\n  + Nội dung kiến thức: ${e.description_source || 'Không có mô tả chi tiết.'}\n  + Trạng thái học viên: Theta ${pTheta} (${status})`,
        );
      }
    }

    const nextLines: string[] = [];
    for (const e of kg) {
      if (String(e.source_id) === currId) {
        nextLines.push(`- ${e.target} (ID: ${e.target_id}): ${e.description_target || 'Nội dung bài tiếp theo'}`);
      }
    }

    const adaptiveCtx: AdaptiveContext = {
      currentContentId: currId,
      currentTheta: currTheta,
      currentTitle: currTitle,
      currentDescription: currDesc,
      prereqAnalysis: prereqLines.join('\n'),
      nextOptions: nextLines.join('\n'),
    };

    const messages = buildAdaptiveMessages(adaptiveCtx);

    const url = `${AI_PROVIDER.baseUrl}${AI_PROVIDER.chatEndpoint}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_PROVIDER.apiKey}`,
      },
      body: JSON.stringify({
        model: AI_PROVIDER.model,
        messages,
        max_tokens: 256,
        temperature: 0,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const text: string = data?.choices?.[0]?.message?.content ?? '';

    // Parse JSON từ response (notebook dùng re.search r'\{[\s\S]*\}')
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Invalid JSON format from AI');

    const aiResult = JSON.parse(match[0]) as { Action: string; Description: string };
    const action = aiResult.Action?.toUpperCase() ?? 'NEXT';
    const description = aiResult.Description ?? 'AI Recommendation';

    // Resolve TargetID (tương đương adaptive_resolve_target_id trong notebook)
    let targetId = currId;
    if (action === 'REVIEW') {
      const candidates: Array<{ id: string; theta: number }> = [];
      for (const e of kg) {
        if (String(e.target_id) === currId && e.type === 'PREREQUISITE') {
          const srcId = String(e.source_id);
          const theta = profileMap.get(srcId)?.theta ?? 0;
          if (theta < 0) candidates.push({ id: srcId, theta });
        }
      }
      if (candidates.length > 0) {
        candidates.sort((a, b) => a.theta - b.theta);
        targetId = candidates[0]!.id;
      }
    } else if (action === 'NEXT') {
      for (const e of kg) {
        if (String(e.source_id) === currId && e.type === 'RELATED') {
          targetId = String(e.target_id);
          break;
        }
      }
    }

    const finalAction = action === 'REVIEW' && targetId === currId ? 'REMEDIAL' : action;

    return {
      request_id: payload.request_id,
      suggestion: { Action: finalAction, TargetID: targetId, Description: description },
      status: 'SUCCESS',
    };
  }

  // ── Fallback logic khi AI call thất bại ────────────────────────────────────
  // Giữ nguyên adaptive_fallback_logic từ notebook
  private adaptiveFallback(payload: NonNullable<Awaited<ReturnType<MasteryService['buildAiPayload']>>>): any {
    const kg = payload.knowledge_graph_subgraph;
    const profile = payload.user_mastery_profile;
    const ctx = payload.current_context;

    const currId = String(ctx.target_content_id);
    const currTheta = ctx.current_theta;
    const pMap = new Map(profile.map((p) => [String(p.content_id), p.theta]));

    const prereqCandidates: Array<{ id: string; theta: number; edge: any }> = [];
    for (const e of kg) {
      if (String(e.target_id) === currId && e.type === 'PREREQUISITE') {
        const prereqId = String(e.source_id);
        const theta = pMap.get(prereqId) ?? 0;
        if (theta < 0) prereqCandidates.push({ id: prereqId, theta, edge: e });
      }
    }

    if (prereqCandidates.length > 0) {
      prereqCandidates.sort((a, b) => a.theta - b.theta);
      const best = prereqCandidates[0]!;
      return { Action: 'REVIEW', TargetID: best.id, Description: `Phát hiện hổng kiến thức nền tảng '${best.edge.source}'` };
    }

    if (currTheta < -1.0) {
      for (const e of kg) {
        if (String(e.source_id) === currId && e.type === 'REMEDIAL') {
          return { Action: 'REMEDIAL', TargetID: String(e.target_id), Description: 'Đề xuất ôn tập bài remedial do năng lực hiện tại thấp' };
        }
      }
      return { Action: 'REMEDIAL', TargetID: currId, Description: 'Đề xuất ôn tập lại bài hiện tại do năng lực còn yếu' };
    }

    for (const e of kg) {
      if (String(e.source_id) === currId && e.type === 'RELATED') {
        return { Action: 'NEXT', TargetID: String(e.target_id), Description: 'Đủ điều kiện chuyển sang bài học tiếp theo' };
      }
    }

    return { Action: 'NEXT', TargetID: currId, Description: 'Không tìm thấy lựa chọn phù hợp hơn, giữ nguyên bài hiện tại' };
  }

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
          // Trước đây gọi external /adaptive endpoint:
          // const aiServiceUrl = await this.systemParameterService.getValue('ADAPTIVE_SERVER_URL', 'https://ai.nguyenduc.click/adaptive');
          // const response = await firstValueFrom(this.httpService.post(aiServiceUrl, payload));
          // Giờ build messages tại BE rồi gọi third-party AI trực tiếp:
          let aiRawData: any;
          try {
            aiRawData = await this.callAdaptiveAI(payload);
          } catch {
            aiRawData = {
              request_id: payload.request_id,
              suggestion: this.adaptiveFallback(payload),
              status: 'SUCCESS',
            };
          }

          if (aiRawData) {
            adaptiveSuggestion = await this.masteryService.formatAiSuggestion(aiRawData);
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
