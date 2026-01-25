import {Injectable, NotFoundException, ForbiddenException, BadRequestException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Brackets, In, Repository} from 'typeorm';
import {QuestionBank, QuizStatus, QuizType, QuestionType} from '../schema/entities/question-bank.entity';
import {CourseQuestion} from '../schema/entities/course-question.entity';
import {Answer} from '../schema/entities/answer.entity';
import {CreateQuizDto} from '../schema/dtos/create-quiz.dto';
import {UpdateQuizDto} from '../schema/dtos/update-quiz.dto';
import {CreateQuestionDto, CreateQuestionsDto} from '../schema/dtos/create-question.dto';
import {UpdateQuestionDto} from '../schema/dtos/update-question.dto';
import {DeleteQuestionDto} from '../schema/dtos/delete-question.dto';
import {SubmitQuizDto} from '../schema/dtos/submit-quiz.dto';
import { MasteryStatus, UserContentMastery } from 'src/schema/entities/user-content-mastery.entity';
import { MasteryCalculator } from 'src/utils/mastery-calculator';
import { StorageService } from './storage.service';
import { QuizAttempt } from '../schema/entities/quiz-attempt.entity';
import { User } from '../schema/entities/user.entity';
import { ExcelQuestionParser } from '../utils/excel-question-parser';
import { ImportQuestionsResponseDto } from '../schema/dtos/import-questions-response.dto';

@Injectable()
export class QuizService {
    constructor(
        @InjectRepository(QuestionBank)
        private quizRepository: Repository<QuestionBank>,
        @InjectRepository(CourseQuestion)
        private questionRepository: Repository<CourseQuestion>,
        @InjectRepository(Answer)
        private answerRepository: Repository<Answer>,
        @InjectRepository(QuizAttempt)
        private attemptRepository: Repository<QuizAttempt>,
        @InjectRepository(User)
        private userRepository: Repository<User>,
        private storageService: StorageService,
    ) {
    }


    async createQuiz(createQuizDto: CreateQuizDto, teacherId: string): Promise<QuestionBank> {

        const teacher = await this.quizRepository.manager.findOne('User', {where: {id: teacherId}});
        if (!teacher) {
            throw new NotFoundException('Giáo viên không tồn tại');
        }


        const course = await this.quizRepository.manager.findOne('CourseContent', {
            where: {content_id: createQuizDto.course_content}
        });
        if (!course) {
            throw new NotFoundException('Nội dung khóa học không tồn tại');
        }

        const quizData: Partial<QuestionBank> = {
            quiz_title: createQuizDto.quiz_title,
            quiz_description: createQuizDto.quiz_description || null,
            course_content: createQuizDto.course_content,
            quiz_type: createQuizDto.quiz_type || QuizType.ASSIGNMENT,
            passing_score: createQuizDto.passing_score?.toString() || '50.00',
            max_attempts: createQuizDto.max_attempts || 1,
            is_random_order: createQuizDto.is_random_order || false,
            is_shuffle_answers: createQuizDto.is_shuffle_answers || false,
            start_time: createQuizDto.start_time ? new Date(createQuizDto.start_time) : null,
            end_time: createQuizDto.end_time ? new Date(createQuizDto.end_time) : null,
            is_required: createQuizDto.is_required || false,
            question_type: createQuizDto.question_type || QuestionType.TN,
            teacher_id: teacherId,
            status: QuizStatus.PUBLISHED,
        };

        const quiz = this.quizRepository.create(quizData);
        return await this.quizRepository.save(quiz);
    }


    async getMyQuizzes(teacherId: string, courseId?: string, status?: QuizStatus) {
        const queryBuilder = this.quizRepository
            .createQueryBuilder('quiz')
            .leftJoinAndSelect('quiz.courseQuestions', 'questions')
            .leftJoinAndSelect('quiz.content', 'content')
            .leftJoinAndSelect('content.course', 'course')
            .leftJoinAndSelect('content.section', 'section')
            .where('quiz.teacher_id = :teacherId', {teacherId});

        if (courseId) {
            queryBuilder.andWhere('content.courses_id = :courseId', {courseId});
        }

        if (status) {
            queryBuilder.andWhere('quiz.status = :status', {status});
        }

        queryBuilder.orderBy('quiz.created_at', 'DESC');

        const quizzes = await queryBuilder.getMany();

        return quizzes.map(quiz => ({
            quizId: quiz.question_bank_id,
            quizTitle: quiz.quiz_title,
            quizDescription: quiz.quiz_description,
            quizType: quiz.quiz_type,
            questionType: quiz.question_type,
            status: quiz.status,
            totalQuestions: quiz.courseQuestions?.length || 0,
            passingScore: quiz.passing_score,
            maxAttempts: quiz.max_attempts,
            startTime: quiz.start_time,
            endTime: quiz.end_time,
            createdAt: quiz.created_at,
            courseInfo: {
                courseId: quiz.content?.course?.course_id,
                courseTitle: quiz.content?.course?.title,
                sectionId: quiz.content?.section?.section_id,
                lessonId: quiz.content?.content_id,
                lessonTitle: quiz.content?.title,
            }
        }));
    }


    async getQuizDetail(quizId: string, teacherId?: string) {
        const quiz = await this.quizRepository.findOne({
            where: {question_bank_id: quizId},
            relations: ['courseQuestions', 'courseQuestions.answers', 'teacher'],
        });

        if (!quiz) {
            throw new NotFoundException('Quiz không tồn tại');
        }


        if (teacherId && quiz.teacher_id !== teacherId) {
            throw new ForbiddenException('Bạn không có quyền xem quiz này');
        }

        return {
            quizInfo: {
                quizId: quiz.question_bank_id,
                quizTitle: quiz.quiz_title,
                quizDescription: quiz.quiz_description,
                quizType: quiz.quiz_type,
                status: quiz.status,
                passingScore: quiz.passing_score,
                maxAttempts: quiz.max_attempts,
                isRandomOrder: quiz.is_random_order,
                isShuffleAnswers: quiz.is_shuffle_answers,
                startTime: quiz.start_time,
                endTime: quiz.end_time,
                isRequired: quiz.is_required,
                createdAt: quiz.created_at,
            },
            questions: quiz.courseQuestions?.map(q => ({
                questionId: q.question_id,
                questionText: q.question_text,
                questionType: q.question_type,
                answers: q.answers?.map(a => ({
                    answerId: a.answer_id,
                    content: a.content,
                    isCorrect: a.is_correct,
                })) || [],
            })) || [],
        };
    }


    async updateQuiz(quizId: string, updateQuizDto: UpdateQuizDto, teacherId: string): Promise<QuestionBank> {
        const quiz = await this.quizRepository.findOne({
            where: {question_bank_id: quizId},
        });

        if (!quiz) {
            throw new NotFoundException('Quiz không tồn tại');
        }

        if (quiz.teacher_id !== teacherId) {
            throw new ForbiddenException('Bạn không có quyền sửa quiz này');
        }

        Object.assign(quiz, updateQuizDto);
        return await this.quizRepository.save(quiz);
    }


    async deleteQuiz(quizId: string, teacherId: string): Promise<void> {
        const quiz = await this.quizRepository.findOne({
            where: {question_bank_id: quizId},
        });

        if (!quiz) {
            throw new NotFoundException('Quiz không tồn tại');
        }

        if (quiz.teacher_id !== teacherId) {
            throw new ForbiddenException('Bạn không có quyền xóa quiz này');
        }

        await this.quizRepository.remove(quiz);
    }


    async addQuestionsToQuiz(quizId: string, createQuestionsDto: CreateQuestionsDto, teacherId: string) {
        const quiz = await this.quizRepository.findOne({
            where: {question_bank_id: quizId},
        });

        if (!quiz) {
            throw new NotFoundException('Quiz không tồn tại');
        }

        if (quiz.teacher_id !== teacherId) {
            throw new ForbiddenException('Bạn không có quyền thêm câu hỏi vào quiz này');
        }

        const results = [];


        for (const createQuestionDto of createQuestionsDto.questions) {

            this.validateQuestionForQuizType(createQuestionDto.answers, quiz.question_type);


            const question = this.questionRepository.create({
                question_text: createQuestionDto.question_text,
                question_type: quiz.question_type,
                time_limit_sec: createQuestionDto.time_limit_sec || null,
                question_bank_id: quizId,
            });

            const savedQuestion = await this.questionRepository.save(question);


            const answers = createQuestionDto.answers.map(answerDto =>
                this.answerRepository.create({
                    content: answerDto.content,
                    is_correct: answerDto.is_correct,
                    question_id: savedQuestion.question_id,
                })
            );

            const savedAnswers = await this.answerRepository.save(answers);

            results.push({
                questionId: savedQuestion.question_id,
                questionText: savedQuestion.question_text,
                questionType: savedQuestion.question_type,
                answers: savedAnswers.map(a => ({
                    answerId: a.answer_id,
                    content: a.content,
                    isCorrect: a.is_correct,
                })),
            });
        }

        return {
            totalQuestions: results.length,
            questions: results,
        };
    }


    async publishQuiz(quizId: string, teacherId: string): Promise<QuestionBank> {
        const quiz = await this.quizRepository.findOne({
            where: {question_bank_id: quizId},
            relations: ['courseQuestions'],
        });

        if (!quiz) {
            throw new NotFoundException('Quiz không tồn tại');
        }

        if (quiz.teacher_id !== teacherId) {
            throw new ForbiddenException('Bạn không có quyền xuất bản quiz này');
        }

        if (!quiz.courseQuestions || quiz.courseQuestions.length === 0) {
            throw new BadRequestException('Quiz phải có ít nhất 1 câu hỏi để xuất bản');
        }

        quiz.status = QuizStatus.PUBLISHED;
        return await this.quizRepository.save(quiz);
    }


    private validateQuestionForQuizType(answers: any[], quizType: QuestionType): void {
        if (!answers) return;

        const correctAnswers = answers.filter(a => a.is_correct).length;

        switch (quizType) {
            case QuestionType.TN:

                if (answers.length < 2) {
                    throw new BadRequestException('Câu hỏi trắc nghiệm phải có ít nhất 2 đáp án');
                }
                if (correctAnswers !== 1) {
                    throw new BadRequestException('Câu hỏi trắc nghiệm phải có đúng 1 đáp án đúng');
                }
                break;

            case QuestionType.YN:

                if (answers.length !== 2) {
                    throw new BadRequestException('Câu hỏi đúng/sai phải có đúng 2 đáp án');
                }
                if (correctAnswers !== 1) {
                    throw new BadRequestException('Câu hỏi đúng/sai phải có đúng 1 đáp án đúng');
                }
                break;

            case QuestionType.TL:

                if (answers.length !== 1) {
                    throw new BadRequestException('Câu hỏi tự luận chỉ cần 1 đáp án mẫu');
                }
                if (!answers[0]?.is_correct) {
                    throw new BadRequestException('Đáp án mẫu của câu hỏi tự luận phải được đánh dấu đúng');
                }
                break;

            case QuestionType.FILL:

                if (answers.length < 1) {
                    throw new BadRequestException('Câu hỏi điền từ phải có ít nhất 1 đáp án');
                }
                if (correctAnswers === 0) {
                    throw new BadRequestException('Câu hỏi điền từ phải có ít nhất 1 đáp án đúng');
                }
                break;

            default:
                throw new BadRequestException('Loại câu hỏi không hợp lệ');
        }
    }


    async updateQuestion(quizId: string, updateQuestionDto: UpdateQuestionDto, teacherId: string) {

        const quiz = await this.quizRepository.findOne({
            where: {question_bank_id: quizId},
        });

        if (!quiz) {
            throw new NotFoundException('Quiz không tồn tại');
        }

        if (quiz.teacher_id !== teacherId) {
            throw new ForbiddenException('Bạn không có quyền sửa câu hỏi trong quiz này');
        }


        const question = await this.questionRepository.findOne({
            where: {
                question_id: updateQuestionDto.question_id,
                question_bank_id: quizId
            },
            relations: ['answers']
        });

        if (!question) {
            throw new NotFoundException('Câu hỏi không tồn tại trong quiz này');
        }


        if (updateQuestionDto.question_text !== undefined) {
            question.question_text = updateQuestionDto.question_text;
        }
        if (updateQuestionDto.time_limit_sec !== undefined) {
            question.time_limit_sec = updateQuestionDto.time_limit_sec;
        }

        await this.questionRepository.save(question);

        let savedAnswers = [];


        if (updateQuestionDto.answers) {

            for (const answerDto of updateQuestionDto.answers) {
                if (answerDto.answer_id) {

                    const answer = await this.answerRepository.findOne({
                        where: {
                            answer_id: answerDto.answer_id,
                            question_id: updateQuestionDto.question_id
                        }
                    });

                    if (!answer) {
                        throw new NotFoundException(`Đáp án với ID ${answerDto.answer_id} không tồn tại trong câu hỏi này`);
                    }

                    answer.content = answerDto.content;
                    answer.is_correct = answerDto.is_correct;
                    await this.answerRepository.save(answer);
                } else {

                    const newAnswer = this.answerRepository.create({
                        content: answerDto.content,
                        is_correct: answerDto.is_correct,
                        question_id: updateQuestionDto.question_id,
                    });
                    await this.answerRepository.save(newAnswer);
                }
            }

            savedAnswers = await this.answerRepository.find({where: {question_id: updateQuestionDto.question_id}});
        } else {

            savedAnswers = await this.answerRepository.find({where: {question_id: updateQuestionDto.question_id}});
        }

        return {
            questionId: question.question_id,
            questionText: question.question_text,
            questionType: question.question_type,
            timeLimitSec: question.time_limit_sec,
            answers: savedAnswers.map(a => ({
                answerId: a.answer_id,
                content: a.content,
                isCorrect: a.is_correct,
            })),
        };
    }


    async deleteQuestion(quizId: string, deleteQuestionDto: DeleteQuestionDto, teacherId: string) {

        const quiz = await this.quizRepository.findOne({
            where: {question_bank_id: quizId},
        });

        if (!quiz) {
            throw new NotFoundException('Quiz không tồn tại');
        }

        if (quiz.teacher_id !== teacherId) {
            throw new ForbiddenException('Bạn không có quyền xóa câu hỏi trong quiz này');
        }


        const question = await this.questionRepository.findOne({
            where: {
                question_id: deleteQuestionDto.question_id,
                question_bank_id: quizId
            }
        });

        if (!question) {
            throw new NotFoundException('Câu hỏi không tồn tại trong quiz này');
        }


        await this.questionRepository.delete(deleteQuestionDto.question_id);

        return {
            message: 'Xóa câu hỏi thành công',
            questionId: deleteQuestionDto.question_id,
        };
    }


    async getPublishedQuizzesForStudent(
        studentId: string,
        courseId?: string,
        sectionId?: string,
        lessonId?: string
    ) {
        const queryBuilder = this.quizRepository
            .createQueryBuilder('quiz')
            .leftJoinAndSelect('quiz.content', 'content')
            .leftJoinAndSelect('content.course', 'course')
            .leftJoinAndSelect('content.section', 'section')
            .where('quiz.status = :status', {status: QuizStatus.PUBLISHED});


        if (courseId) {
            queryBuilder.andWhere('course.course_id = :courseId', {courseId});
        }


        if (sectionId) {
            queryBuilder.andWhere('section.section_id = :sectionId', {sectionId});
        }


        if (lessonId) {
            queryBuilder.andWhere('content.content_id = :lessonId', {lessonId});
        }


        queryBuilder
        .leftJoin(
            'course_registrations',
            'reg',
            'reg.course_id = course.course_id AND reg.user_id = :studentId',
            { studentId }
        )
        .andWhere(
            new Brackets(qb => {
            qb.where('reg.user_id IS NOT NULL')
                .orWhere('course.visibility = :visibility');
            }),
            { visibility: 'PUBLIC' }
        );

        queryBuilder.orderBy('quiz.created_at', 'DESC');

        const quizzes = await queryBuilder.getMany();

        return quizzes.map(quiz => ({
            quizId: quiz.question_bank_id,
            quizTitle: quiz.quiz_title,
            quizDescription: quiz.quiz_description,
            quizType: quiz.quiz_type,
            passingScore: quiz.passing_score,
            maxAttempts: quiz.max_attempts,
            startTime: quiz.start_time,
            endTime: quiz.end_time,
            isRequired: quiz.is_required,
            courseInfo: {
                courseId: quiz.content?.course?.course_id,
                courseTitle: quiz.content?.course?.title,
                sectionId: quiz.content?.section?.section_id,
                sectionTitle: quiz.content?.section?.title,
                lessonId: quiz.content?.content_id,
                lessonTitle: quiz.content?.title,
            }
        }));
    }

    async getQuizDetailForStudent(quizId: string, studentId: string) {

        const quiz = await this.quizRepository.findOne({
            where: {
                question_bank_id: quizId,
                status: QuizStatus.PUBLISHED
            },
            relations: ['courseQuestions', 'courseQuestions.answers', 'content', 'content.course']
        });

        if (!quiz) {
            throw new NotFoundException('Quiz không tồn tại hoặc chưa được xuất bản');
        }


        if (quiz.content?.course?.course_id) {
            const courseRegistration = await this.quizRepository.manager.findOne('CourseRegistration', {
                where: {
                    course_id: quiz.content.course.course_id,
                    user_id: studentId
                }
            });

            if (!courseRegistration && quiz.content.course.visibility !== 'PUBLIC') {
                throw new ForbiddenException('Bạn không có quyền truy cập quiz này');
            }
        }


        const now = new Date();
        if (quiz.start_time && now < quiz.start_time) {
            throw new BadRequestException('Quiz chưa đến thời gian bắt đầu');
        }
        if (quiz.end_time && now > quiz.end_time) {
            throw new BadRequestException('Quiz đã hết thời gian làm bài');
        }


        const attempts = await this.quizRepository.manager.find('QuizAttempt', {
            where: {
                question_bank_id: quizId,
                student_id: studentId
            }
        });

        const remainingAttempts = quiz.max_attempts - attempts.length;
        if (remainingAttempts <= 0) {
            throw new BadRequestException('Bạn đã hết số lần làm bài cho phép');
        }


        const attempt = this.quizRepository.manager.create('QuizAttempt', {
            question_bank_id: quizId,
            student_id: studentId,
            attempt_number: attempts.length + 1,
            status: 'IN_PROGRESS',
            started_at: now
        });

        const savedAttempt = await this.quizRepository.manager.save('QuizAttempt', attempt) as any;


        let questions = quiz.courseQuestions || [];
        if (quiz.is_random_order) {
            questions = this.shuffleArray([...questions]);
        }

        const processedQuestions = questions.map(question => {
            let answers = question.answers || [];
            if (quiz.is_shuffle_answers) {
                answers = this.shuffleArray([...answers]);
            }

            return {
                questionId: question.question_id,
                questionText: question.question_text,
                questionType: question.question_type,
                timeLimitSec: question.time_limit_sec,
                answers: answers.map(answer => ({
                    answerId: answer.answer_id,
                    content: answer.content

                }))
            };
        });

        return {
            attemptId: savedAttempt.attempt_id,
            quizInfo: {
                quizId: quiz.question_bank_id,
                quizTitle: quiz.quiz_title,
                quizDescription: quiz.quiz_description,
                quizType: quiz.quiz_type,
                passingScore: quiz.passing_score,
                maxAttempts: quiz.max_attempts,
                remainingAttempts: remainingAttempts,
                startTime: quiz.start_time,
                endTime: quiz.end_time,
                isRequired: quiz.is_required
            },
            questions: processedQuestions
        };
    }

    private shuffleArray<T>(array: T[]): T[] {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = shuffled[i]!;
            shuffled[i] = shuffled[j]!;
            shuffled[j] = temp;
        }
        return shuffled;
    }

    async submitQuizForStudent(submitQuizDto: SubmitQuizDto, studentId: string) {

        let valueUpdate = 0;
        const quiz = await this.quizRepository.findOne({
            where: {
                question_bank_id: submitQuizDto.quiz_id,
                status: QuizStatus.PUBLISHED
            },
            relations: ['courseQuestions', 'courseQuestions.answers', 'content', 'content.course']
        });

        if (!quiz) {
            throw new NotFoundException('Quiz không tồn tại hoặc chưa được xuất bản');
        }


        if (quiz.content?.course?.course_id) {
            const courseRegistration = await this.quizRepository.manager.findOne('CourseRegistration', {
                where: {
                    course_id: quiz.content.course.course_id,
                    user_id: studentId
                }
            });

            if (!courseRegistration && quiz.content.course.visibility !== 'PUBLIC') {
                throw new ForbiddenException('Bạn không có quyền truy cập quiz này');
            }
        }


        let attempt = await this.quizRepository.manager.findOne('QuizAttempt', {
            where: {
                student_id: studentId,
                question_bank_id: submitQuizDto.quiz_id,
                status: 'IN_PROGRESS'
            }
        }) as any;


        if (!attempt) {

            const existingAttempts = await this.quizRepository.manager.find('QuizAttempt', {
                where: {
                    question_bank_id: submitQuizDto.quiz_id,
                    student_id: studentId
                }
            });

            const remainingAttempts = quiz.max_attempts - existingAttempts.length;
            if (remainingAttempts <= 0) {
                throw new BadRequestException('Bạn đã hết số lần làm bài cho phép');
            }


            const newAttempt = this.quizRepository.manager.create('QuizAttempt', {
                question_bank_id: submitQuizDto.quiz_id,
                student_id: studentId,
                attempt_number: existingAttempts.length + 1,
                status: 'IN_PROGRESS',
                started_at: new Date()
            });

            attempt = await this.quizRepository.manager.save('QuizAttempt', newAttempt) as any;
        }


        const now = new Date();
        if (quiz.end_time && now > quiz.end_time) {
            throw new BadRequestException('Đã hết thời gian nộp bài');
        }


        const timeSpentMinutes = Math.floor((now.getTime() - attempt.started_at.getTime()) / (1000 * 60));


        const questions = quiz.courseQuestions || [];
        const correctAnswers = new Map();

        // --- PREPARE ADAPTIVE DATA ---
        const masteryCalculator = new MasteryCalculator();
        const masteryUpdates = new Map<string, UserContentMastery>();

        // map content Id
        const targetContentId = quiz.course_content;
        const contentIds = targetContentId ? [targetContentId] : [];
        
        let existingMasteries: UserContentMastery[] = [];
        if (contentIds.length > 0) {
            existingMasteries = await this.quizRepository.manager.find(UserContentMastery, {
                where: { user_id: studentId, content_id: In(contentIds) }
            });
        }

        questions.forEach(question => {
            question.answers?.forEach(answer => {
                if (answer.is_correct) {
                    correctAnswers.set(question.question_id, answer.answer_id);
                }
            });
        });


        let correctCount = 0;
        let totalQuestions = questions.length;
        const responses = [];


        for (const answerSubmission of submitQuizDto.answers) {
            const isCorrect = correctAnswers.get(answerSubmission.question_id) === answerSubmission.answer_id;
            if (isCorrect) {
                correctCount++;
            }


            const response = this.quizRepository.manager.create('QuizResponse', {
                result_id: null,
                question_id: answerSubmission.question_id,
                selected_answer_id: answerSubmission.answer_id || null,
                text_answer: answerSubmission.text_answer || null,
                is_correct: isCorrect,
                points_earned: isCorrect ? (100 / totalQuestions).toFixed(2) : '0.00',
                answered_at: now
            });

            responses.push(response);

            // adaptive
            if (targetContentId) {
        
                // 1. Tìm câu hỏi gốc để lấy độ khó
                const questionEntity = questions.find(q => q.question_id === answerSubmission.question_id);
                const difficulty = questionEntity?.irt_difficulty || 0;

                // 2. Lấy Mastery Record hiện tại
                let currentRecord = masteryUpdates.get(targetContentId) || 
                                    existingMasteries.find(m => m.content_id === targetContentId) || 
                                    null;

                // 3. Tính toán Theta 
                const updateResult = masteryCalculator.calculateExamUpdate(
                    currentRecord, 
                    difficulty, 
                    isCorrect
                );

                // 4. Update Entity
                if (!currentRecord) {
                    currentRecord = new UserContentMastery();
                    currentRecord.user_id = studentId;
                    currentRecord.content_id = targetContentId;
                }

                currentRecord.theta = updateResult.theta || 0;
                currentRecord.certainty = updateResult.certainty || 0.2;
                currentRecord.status = updateResult.status || MasteryStatus.UNLOCKED;
                currentRecord.last_updated = updateResult.last_updated || new Date();

                if(currentRecord.theta){
                    valueUpdate = currentRecord.theta;
                }
                // Lưu
                masteryUpdates.set(targetContentId, currentRecord);
            }
        }


        const score = totalQuestions > 0 ? ((correctCount / totalQuestions) * 100).toFixed(2) : '0.00';
        const isPassed = parseFloat(score) >= parseFloat(quiz.passing_score);


        attempt.status = 'COMPLETED';
        attempt.submitted_at = now;
        attempt.time_spent_minutes = timeSpentMinutes;
        attempt.score = score;
        attempt.is_passed = isPassed;

        await this.quizRepository.manager.save('QuizAttempt', attempt);


        const quizResult = this.quizRepository.manager.create('QuizResult', {
            attempt_number: attempt.attempt_number,
            score: score,
            completed_at: now,
            question_bank_id: submitQuizDto.quiz_id,
            student_id: studentId,
            attempt_id: attempt.attempt_id,
            status: 'COMPLETED',
            started_at: attempt.started_at,
            time_spent_minutes: timeSpentMinutes,
            is_passed: isPassed
        });

        const savedResult = await this.quizRepository.manager.save('QuizResult', quizResult) as any;


        responses.forEach((response: any) => {
            response.result_id = savedResult.result_id;
        });

        await this.quizRepository.manager.save('QuizResponse', responses);


        const questionResults = questions.map(question => {
            const userAnswer = submitQuizDto.answers.find(a => a.question_id === question.question_id);
            const correctAnswerId = correctAnswers.get(question.question_id);        
            const correctAnswer = question.answers.find(a => a.is_correct === true);
            const selectedAnswer = question.answers.find(
                a => a.answer_id === userAnswer?.answer_id
            );

            const isCorrect = userAnswer?.answer_id === correctAnswerId;

            return {
                questionId: question.question_id,
                questionText: question.question_text,
                userAnswer: {
                    answerId: userAnswer?.answer_id || null,
                    textAnswer: selectedAnswer?.content || null
                },
                correctAnswerId: correctAnswerId,
                correctAnswer: correctAnswer?.content || null,
                isCorrect: isCorrect,
                pointsEarned: isCorrect ? (100 / totalQuestions).toFixed(2) : '0.00'
            };
        });

        if (masteryUpdates.size > 0) {
            await this.quizRepository.manager.save(UserContentMastery, Array.from(masteryUpdates.values()));
        }

        return {
            attemptId: attempt.attempt_id,
            quizId: submitQuizDto.quiz_id,
            score: score,
            isPassed: isPassed,
            passingScore: quiz.passing_score,
            timeSpentMinutes: timeSpentMinutes,
            submittedAt: now,
            totalQuestions: totalQuestions,
            correctAnswers: correctCount,
            questionResults: questionResults,
            targetContentId: targetContentId,
            currentTheta: valueUpdate,
        };
    }


    async getQuizHistoryForStudent(quizId: string, studentId: string) {
        const repo: any = this.quizRepository.manager.getRepository('QuizResult' as any);
        const results = await repo
            .createQueryBuilder('qr')
            .where('qr.question_bank_id = :quizId AND qr.student_id = :studentId', { quizId, studentId })
            .orderBy('qr.started_at', 'DESC')
            .getMany() as any[];

        return results.map((r: any) => ({
            resultId: r.result_id,
            attemptId: r.attempt_id,
            attemptNumber: r.attempt_number,
            status: r.status,
            score: r.score,
            isPassed: r.is_passed,
            startedAt: r.started_at,
            completedAt: r.completed_at,
            timeSpentMinutes: r.time_spent_minutes
        }));
    }

    async getLeaderboard(courseId?: string) {
        const queryBuilder = this.attemptRepository
            .createQueryBuilder('attempt')
            .leftJoinAndSelect('attempt.student', 'student')
            .leftJoinAndSelect('attempt.questionBank', 'quiz')
            .leftJoinAndSelect('quiz.content', 'content')
            .leftJoinAndSelect('content.course', 'course')
            .where('attempt.status = :status', { status: 'COMPLETED' });

        if (courseId) {
            queryBuilder.andWhere('course.course_id = :courseId', { courseId });
        }

        const allAttempts = await queryBuilder.getMany();

        const studentMap = new Map<string, {
            student: User;
            quizScores: Map<string, { score: number; isPassed: boolean; submittedAt: Date }>;
        }>();

        for (const attempt of allAttempts) {
            const studentId = attempt.student_id;
            const quizId = attempt.question_bank_id;

            if (!studentMap.has(studentId)) {
                studentMap.set(studentId, {
                    student: attempt.student,
                    quizScores: new Map(),
                });
            }

            const studentData = studentMap.get(studentId)!;
            const existingQuizScore = studentData.quizScores.get(quizId);

            if (!existingQuizScore || (attempt.submitted_at && attempt.submitted_at > existingQuizScore.submittedAt)) {
                studentData.quizScores.set(quizId, {
                    score: parseFloat(attempt.score),
                    isPassed: attempt.is_passed,
                    submittedAt: attempt.submitted_at || new Date(),
                });
            }
        }

        const leaderboardData = [];

        for (const [studentId, data] of studentMap.entries()) {
            const scores = Array.from(data.quizScores.values());
            const totalQuizzes = scores.length;
            const quizzesPassed = scores.filter(s => s.isPassed).length;
            const averageScore = totalQuizzes > 0
                ? scores.reduce((sum, s) => sum + s.score, 0) / totalQuizzes
                : 0;

            let avatarSasUrl: string | null = null;
            if (data.student.avatar_url) {
                try {
                    avatarSasUrl = await this.storageService.generateSasUrlFromUrl(
                        data.student.avatar_url,
                        'image',
                        87600
                    );
                } catch (e) {
                    avatarSasUrl = null;
                }
            }

            leaderboardData.push({
                studentId: studentId,
                studentName: data.student.full_name || data.student.username,
                avatarUrl: avatarSasUrl,
                averageScore: parseFloat(averageScore.toFixed(2)),
                totalQuizzes: totalQuizzes,
                quizzesPassed: quizzesPassed,
                passRate: totalQuizzes > 0 ? parseFloat(((quizzesPassed / totalQuizzes) * 100).toFixed(2)) : 0,
            });
        }

        leaderboardData.sort((a, b) => b.averageScore - a.averageScore);

        const leaderboard = leaderboardData.map((item, index) => ({
            rank: index + 1,
            ...item,
        }));

        return {
            scope: courseId ? 'course' : 'global',
            courseId: courseId || null,
            leaderboard: leaderboard,
        };
    }

    async importQuestionsFromExcel(
        quizId: string,
        file: Express.Multer.File,
        teacherId: string
    ): Promise<ImportQuestionsResponseDto> {
        if (!file) {
            throw new BadRequestException('File không được để trống');
        }

        if (!file.originalname.match(/\.(xlsx)$/)) {
            throw new BadRequestException('Chỉ chấp nhận file Excel (.xlsx)');
        }

        if (file.size > 5 * 1024 * 1024) {
            throw new BadRequestException('File không được vượt quá 5MB');
        }

        const quiz = await this.quizRepository.findOne({
            where: {question_bank_id: quizId},
        });

        if (!quiz) {
            throw new NotFoundException('Quiz không tồn tại');
        }

        if (quiz.teacher_id !== teacherId) {
            throw new ForbiddenException('Bạn không có quyền thêm câu hỏi vào quiz này');
        }

        if (quiz.question_type !== QuestionType.TN) {
            throw new BadRequestException('Chỉ hỗ trợ import cho quiz trắc nghiệm');
        }

        const parseResult = ExcelQuestionParser.parseFile(file.buffer);
        const validQuestions: typeof parseResult.questions = [];
        const allErrors = [...parseResult.errors];

        for (const parsedQ of parseResult.questions) {
            try {
                this.validateQuestionForQuizType(parsedQ.answers, quiz.question_type);
                validQuestions.push(parsedQ);
            } catch (error: any) {
                allErrors.push({
                    row: parsedQ.rowNumber,
                    message: error.message
                });
            }
        }

        const createdQuestions: Array<{
            questionId: string;
            questionText: string;
            questionType: string | null;
            answers: Array<{
                answerId: string;
                content: string;
                isCorrect: boolean;
            }>;
        }> = [];

        if (validQuestions.length > 0) {
            await this.quizRepository.manager.transaction(async (manager) => {
                for (const validQ of validQuestions) {
                    const question = manager.create(CourseQuestion, {
                        question_text: validQ.question_text,
                        question_type: quiz.question_type,
                        time_limit_sec: validQ.time_limit_sec,
                        question_bank_id: quizId,
                    });

                    const savedQuestion = await manager.save(CourseQuestion, question);

                    const answers = validQ.answers.map((a) =>
                        manager.create(Answer, {
                            content: a.content,
                            is_correct: a.is_correct,
                            question_id: savedQuestion.question_id,
                        })
                    );

                    const savedAnswers = await manager.save(Answer, answers);

                    createdQuestions.push({
                        questionId: savedQuestion.question_id,
                        questionText: savedQuestion.question_text,
                        questionType: savedQuestion.question_type,
                        answers: savedAnswers.map((a) => ({
                            answerId: a.answer_id,
                            content: a.content,
                            isCorrect: a.is_correct,
                        })),
                    });
                }
            });
        }

        return {
            success: true,
            summary: {
                totalRows: parseResult.questions.length + parseResult.errors.length,
                successCount: createdQuestions.length,
                errorCount: allErrors.length,
            },
            errors: allErrors,
            questions: createdQuestions,
        };
    }

    async generateExcelTemplate(): Promise<Buffer> {
        return ExcelQuestionParser.generateTemplate();
    }
}
