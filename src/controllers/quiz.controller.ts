import {
    Body,
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Query,
    Req,
    UseGuards,
    HttpCode,
    UseInterceptors,
    UploadedFile,
    Res
} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';
import {Response} from 'express';
import {QuizService} from '../services/quiz.service';
import {JwtAuthGuard} from '../common/guards/jwt-auth.guard';
import {RolesGuard} from '../common/guards/roles.guard';
import {Roles} from '../common/guards/roles.decorator';
import {SystemRole} from '../schema/entities/role.entity';
import {CreateQuizDto} from '../schema/dtos/create-quiz.dto';
import {UpdateQuizDto} from '../schema/dtos/update-quiz.dto';
import {CreateQuestionsDto} from '../schema/dtos/create-question.dto';
import {UpdateQuestionDto} from '../schema/dtos/update-question.dto';
import {DeleteQuestionDto} from '../schema/dtos/delete-question.dto';
import {GetMyQuizzesDto} from '../schema/dtos/get-my-quizzes.dto';
import {QuizStatus} from '../schema/entities/question-bank.entity';

@Controller('quizzes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QuizController {
    constructor(private readonly quizService: QuizService) {
    }


    @Post()
    @HttpCode(201)
    @Roles(SystemRole.TEACHER, SystemRole.ADMIN)
    async createQuiz(@Body() createQuizDto: CreateQuizDto, @Req() req: any) {
        const teacherId = req.user.id;
        const quiz = await this.quizService.createQuiz(createQuizDto, teacherId);

        return {
            quizId: quiz.question_bank_id,
            quizTitle: quiz.quiz_title,
            status: quiz.status,
        };
    }


    @Post('by-course')
    @HttpCode(200)
    @Roles(SystemRole.TEACHER, SystemRole.ADMIN)
    async getQuizzesByCourse(
        @Req() req: any,
        @Body() getMyQuizzesDto: GetMyQuizzesDto
    ) {
        const teacherId = req.user.id;
        const quizzes = await this.quizService.getMyQuizzes(teacherId, getMyQuizzesDto.courseId, getMyQuizzesDto.status);

        return quizzes;
    }

    
    @Put('update-question')
    @HttpCode(200)
    @Roles(SystemRole.TEACHER, SystemRole.ADMIN)
    async updateQuestion(
        @Body() updateQuestionDto: UpdateQuestionDto,
        @Req() req: any
    ) {
        const teacherId = req.user.id;
        const result = await this.quizService.updateQuestion(updateQuestionDto.quiz_id, updateQuestionDto, teacherId);

        return result;
    }

    
    @Delete('delete-question')
    @HttpCode(200)
    @Roles(SystemRole.TEACHER, SystemRole.ADMIN)
    async deleteQuestion(
        @Body() deleteQuestionDto: DeleteQuestionDto,
        @Req() req: any
    ) {
        const teacherId = req.user.id;
        const result = await this.quizService.deleteQuestion(deleteQuestionDto.quiz_id, deleteQuestionDto, teacherId);

        return { questionId: result.questionId };
    }

    @Get('my-quizzes')
    @HttpCode(200)
    @Roles(SystemRole.TEACHER, SystemRole.ADMIN)
    async getMyQuizzes(@Req() req: any, @Query('courseId') courseId?: string, @Query('status') status?: QuizStatus) {
        const teacherId = req.user.id;
        const quizzes = await this.quizService.getMyQuizzes(teacherId, courseId, status);

        return quizzes;
    }

    @Get('leaderboard')
    @HttpCode(200)
    @Roles(SystemRole.STUDENT, SystemRole.TEACHER, SystemRole.ADMIN)
    async getLeaderboard(@Query('courseId') courseId?: string) {
        const leaderboard = await this.quizService.getLeaderboard(courseId);
        return leaderboard;
    }

    @Get('download-template')
    @HttpCode(200)
    @Roles(SystemRole.TEACHER, SystemRole.ADMIN)
    async downloadTemplate(@Res() res: Response) {
        const buffer = await this.quizService.generateExcelTemplate();

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=quiz-template.xlsx');
        res.send(buffer);
    }

    @Get(':quizId')
    @HttpCode(200)
    @Roles(SystemRole.TEACHER, SystemRole.ADMIN)
    async getQuizDetail(@Req() req: any, @Param('quizId') quizId: string) {
        const teacherId = req.user.id;
        const quizDetail = await this.quizService.getQuizDetail(quizId, teacherId);

        return quizDetail;
    }


    @Put(':quizId')
    @HttpCode(200)
    @Roles(SystemRole.TEACHER, SystemRole.ADMIN)
    async updateQuiz(
        @Param('quizId') quizId: string,
        @Body() updateQuizDto: UpdateQuizDto,
        @Req() req: any
    ) {
        const teacherId = req.user.id;
        const quiz = await this.quizService.updateQuiz(quizId, updateQuizDto, teacherId);

        return {
            quizId: quiz.question_bank_id,
            quizTitle: quiz.quiz_title,
        };
    }


    @Delete(':quizId')
    @HttpCode(200)
    @Roles(SystemRole.TEACHER, SystemRole.ADMIN)
    async deleteQuiz(@Param('quizId') quizId: string, @Req() req: any) {
        const teacherId = req.user.id;
        await this.quizService.deleteQuiz(quizId, teacherId);

        return null;
    }


    @Post('add-questions')
    @HttpCode(201)
    @Roles(SystemRole.TEACHER, SystemRole.ADMIN)
    async addQuestionsToQuiz(
        @Body() createQuestionsDto: CreateQuestionsDto,
        @Req() req: any
    ) {
        const teacherId = req.user.id;
        const result = await this.quizService.addQuestionsToQuiz(createQuestionsDto.quiz_id, createQuestionsDto, teacherId);

        return result;
    }


    @Post(':quizId/publish')
    @HttpCode(200)
    @Roles(SystemRole.TEACHER, SystemRole.ADMIN)
    async publishQuiz(@Param('quizId') quizId: string, @Req() req: any) {
        const teacherId = req.user.id;
        const quiz = await this.quizService.publishQuiz(quizId, teacherId);

        return {
            quizId: quiz.question_bank_id,
            status: quiz.status,
        };
    }

    @Post('import-questions')
    @HttpCode(200)
    @Roles(SystemRole.TEACHER, SystemRole.ADMIN)
    @UseInterceptors(FileInterceptor('file'))
    async importQuestions(
        @Query('quizId') quizId: string,
        @UploadedFile() file: Express.Multer.File,
        @Req() req: any
    ) {
        const teacherId = req.user.id;
        const result = await this.quizService.importQuestionsFromExcel(quizId, file, teacherId);

        return result;
    }

}
