import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { FilterTeacherStatDto } from "src/schema/dtos/filter-results.dto";
import { Course } from "src/schema/entities/course.entity";
import { QuestionBank } from "src/schema/entities/question-bank.entity";
import { QuizResult } from "src/schema/entities/quiz-result.entity";
import { Repository } from "typeorm";
import ExcelJS from "exceljs";
import { ExcelFormatter } from "src/constants/utils/excelFormat";

@Injectable()
export class TeacherStatisticsService {
  constructor(
    @InjectRepository(QuizResult)
    private readonly resultRepo: Repository<QuizResult>,

    @InjectRepository(QuestionBank)
    private readonly questionBankRepo: Repository<QuestionBank>,

    @InjectRepository(Course)
    private readonly courseRepo: Repository<Course>
  ) {}

  async getTeacherStatistics(teacherId: string, filter: FilterTeacherStatDto) {
    const { courseId, quizId } = filter;

    if (courseId && quizId) {
      const quiz = await this.questionBankRepo.findOne({
        where: {
          question_bank_id: quizId,
          content: { course: { course_id: courseId } },
          teacher_id: teacherId,
        },
        relations: ["content", "content.course"],
      });
      if (!quiz) {
        throw new BadRequestException(
          "Quiz không thuộc khóa học này hoặc không tồn tại"
        );
      }

      const result = await this.resultRepo
        .createQueryBuilder("qr")
        .leftJoin("qr.questionBank", "qb")
        .leftJoin("qb.content", "content")
        .leftJoin("content.course", "course")
        .select([
          "COUNT(qr.result_id)::int AS total_results",
          "AVG(qr.score)::float AS avg_score",
          "SUM(CASE WHEN qr.is_passed THEN 1 ELSE 0 END)::int AS total_passed",
        ])
        .where("qb.teacher_id = :teacherId", { teacherId })
        .andWhere("qb.question_bank_id = :quizId", { quizId })
        .andWhere("course.course_id = :courseId", { courseId })
        .getRawOne();

      return {
        type: "quiz_in_course",
        course: {
          course_id: courseId,
          title: quiz.content?.course.title,
        },
        quiz: {
          quiz_id: quiz.question_bank_id,
          quiz_title: quiz.quiz_title,
          total_results: Number(result?.total_results) || 0,
          avg_score: Number(result?.avg_score?.toFixed(2)) || 0,
          total_passed: Number(result?.total_passed) || 0,
          pass_rate:
            Number(result?.total_results) > 0
              ? Math.round(
                  (Number(result?.total_passed) /
                    Number(result?.total_results)) *
                    100
                )
              : 0,
        },
      };
    }

    if (quizId) {
      const quiz = await this.questionBankRepo.findOne({
        where: { question_bank_id: quizId, teacher_id: teacherId },
        relations: ["content", "content.course"],
      });
      if (!quiz) {
        throw new NotFoundException("Không tìm thấy quiz này");
      }

      const stats = await this.resultRepo
        .createQueryBuilder("qr")
        .select([
          "COUNT(qr.result_id)::int AS total_results",
          "AVG(qr.score)::float AS avg_score",
          "SUM(CASE WHEN qr.is_passed THEN 1 ELSE 0 END)::int AS total_passed",
        ])
        .where("qr.question_bank_id = :quizId", { quizId })
        .getRawOne();

      return {
        type: "quiz",
        quiz: {
          quiz_id: quiz.question_bank_id,
          quiz_title: quiz.quiz_title,
          course: {
            course_id: quiz.content?.course.course_id,
            title: quiz.content?.course.title,
          },
          total_results: Number(stats?.total_results) || 0,
          avg_score: Number(stats?.avg_score?.toFixed(2)) || 0,
          total_passed: Number(stats?.total_passed) || 0,
          pass_rate:
            Number(stats?.total_results) > 0
              ? Math.round(
                  (Number(stats?.total_passed) / Number(stats?.total_results)) *
                    100
                )
              : 0,
        },
      };
    }

    if (courseId) {
      const course = await this.courseRepo.findOne({
        where: { course_id: courseId, owner: { id: teacherId } },
      });
      if (!course) throw new NotFoundException("Không tìm thấy khóa học");

      const quizStats = await this.resultRepo
        .createQueryBuilder("qr")
        .leftJoin("qr.questionBank", "qb")
        .leftJoin("qb.content", "content")
        .leftJoin("content.course", "course")
        .select([
          "qb.question_bank_id AS quiz_id",
          "qb.quiz_title AS quiz_title",
          "COUNT(qr.result_id)::int AS total_results",
          "AVG(qr.score)::float AS avg_score",
          "SUM(CASE WHEN qr.is_passed THEN 1 ELSE 0 END)::int AS total_passed",
        ])
        .where("course.course_id = :courseId", { courseId })
        .andWhere("qb.teacher_id = :teacherId", { teacherId })
        .groupBy("qb.question_bank_id")
        .addGroupBy("qb.quiz_title")
        .getRawMany();

      const allQuizzes = await this.questionBankRepo.find({
        where: {
          content: { course: { course_id: courseId } },
          teacher_id: teacherId,
        },
      });
      const map = new Map(quizStats.map((q) => [q.quiz_id, q]));
      for (const q of allQuizzes) {
        if (!map.has(q.question_bank_id)) {
          quizStats.push({
            quiz_id: q.question_bank_id,
            quiz_title: q.quiz_title,
            total_results: 0,
            avg_score: 0,
            total_passed: 0,
          });
        }
      }

      return {
        type: "course",
        course: {
          course_id: course.course_id,
          title: course.title,
          total_quizzes: allQuizzes.length,
        },
        quizzes: quizStats,
      };
    }

    const [courseCount, quizCount, resultStats] = await Promise.all([
      this.courseRepo.count({ where: { owner: { id: teacherId } } }),
      this.questionBankRepo.count({ where: { teacher_id: teacherId } }),
      this.resultRepo
        .createQueryBuilder("qr")
        .leftJoin("qr.questionBank", "qb")
        .where("qb.teacher_id = :teacherId", { teacherId })
        .select([
          "COUNT(qr.result_id)::int AS total_results",
          "AVG(qr.score)::float AS avg_score",
          "SUM(CASE WHEN qr.is_passed THEN 1 ELSE 0 END)::int AS total_passed",
        ])
        .getRawOne(),
    ]);

    return {
      type: "summary",
      overview: {
        total_courses: courseCount,
        total_quizzes: quizCount,
        total_results: Number(resultStats?.total_results) || 0,
        avg_score: Number(resultStats?.avg_score?.toFixed(2)) || 0,
        total_passed: Number(resultStats?.total_passed) || 0,
      },
    };
  }

  async exportTeacherCourseReport(teacherId: string, courseId: string) {
    const course = await this.courseRepo.findOne({
      where: { course_id: courseId },
      relations: ["owner"],
    });
    if (!course) throw new NotFoundException("Không tìm thấy khóa học");
    if (course.owner?.id !== teacherId)
      throw new ForbiddenException("Bạn không có quyền truy cập khóa học này");

    const overview = await this.resultRepo
      .createQueryBuilder("qr")
      .leftJoin("qr.questionBank", "qb")
      .leftJoin("qb.content", "content")
      .leftJoin("content.course", "course")
      .select([
        "COUNT(qr.result_id)::int AS total_attempts",
        "AVG(qr.score)::float AS avg_score",
        "SUM(CASE WHEN qr.is_passed THEN 1 ELSE 0 END)::int AS total_passed",
      ])
      .where("course.course_id = :courseId", { courseId })
      .andWhere("qb.teacher_id = :teacherId", { teacherId })
      .getRawOne();

    const quizStats = await this.resultRepo
      .createQueryBuilder("qr")
      .leftJoin("qr.questionBank", "qb")
      .leftJoin("qb.content", "content")
      .leftJoin("content.course", "course")
      .select([
        "qb.question_bank_id AS quiz_id",
        "qb.quiz_title AS quiz_title",
        "COUNT(qr.result_id)::int AS total_results",
        "AVG(qr.score)::float AS avg_score",
        "SUM(CASE WHEN qr.is_passed THEN 1 ELSE 0 END)::int AS total_passed",
      ])
      .where("course.course_id = :courseId", { courseId })
      .andWhere("qb.teacher_id = :teacherId", { teacherId })
      .groupBy("qb.question_bank_id")
      .addGroupBy("qb.quiz_title")
      .getRawMany();

    const allQuizzes = await this.questionBankRepo.find({
      where: {
        content: { course: { course_id: courseId } },
        teacher_id: teacherId,
      },
      relations: ["content", "content.course"],
    });
    const quizMap = new Map(quizStats.map((q) => [q.quiz_id, q]));
    for (const quiz of allQuizzes) {
      if (!quizMap.has(quiz.question_bank_id)) {
        quizStats.push({
          quiz_id: quiz.question_bank_id,
          quiz_title: quiz.quiz_title,
          total_results: 0,
          avg_score: 0,
          total_passed: 0,
        });
      }
    }

    const studentResults = await this.resultRepo
      .createQueryBuilder("qr")
      .leftJoinAndSelect("qr.student", "student")
      .leftJoin("qr.questionBank", "qb")
      .leftJoin("qb.content", "content")
      .leftJoin("content.course", "course")
      .where("course.course_id = :courseId", { courseId })
      .andWhere("qb.teacher_id = :teacherId", { teacherId })
      .select([
        "student.username AS student_name",
        "qb.quiz_title AS quiz_title",
        "qr.score AS score",
        "qr.is_passed AS is_passed",
        "qr.completed_at AS completed_at",
      ])
      .orderBy("student.username", "ASC")
      .addOrderBy("qr.completed_at", "DESC")
      .getRawMany();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "EdTech System";
    workbook.created = new Date();

    const summarySheet = workbook.addWorksheet("Tổng quan");
    summarySheet.addRows([
      ["BÁO CÁO KHÓA HỌC"],
      [],
      ["Tên khóa học", course.title],
      ["Người tạo", course.owner.username],
      ["Ngày tạo", course.created_at.toLocaleString()],
      ["Cập nhật lần cuối", course.updated_at.toLocaleString()],
      ["Số bài kiểm tra", allQuizzes.length],
      ["Tổng lượt làm bài", Number(overview?.total_attempts) || 0],
      ["Tổng pass", Number(overview?.total_passed) || 0],
      ["Điểm trung bình", Number(overview?.avg_score?.toFixed(2)) || 0],
      [
        "Tỷ lệ pass (%)",
        Number(overview?.total_attempts) > 0
          ? `${Math.round(
              (Number(overview?.total_passed) /
                Number(overview?.total_attempts)) *
                100
            )}%`
          : "0%",
      ],
    ]);

    const quizSheet = workbook.addWorksheet("Thống kê Quiz");
    quizSheet.columns = [
      { header: "Quiz ID", key: "quiz_id", width: 15 },
      { header: "Tên Quiz", key: "quiz_title", width: 40 },
      { header: "Lượt làm", key: "total_results", width: 15 },
      { header: "Điểm TB", key: "avg_score", width: 15 },
      { header: "Số Pass", key: "total_passed", width: 15 },
      { header: "Tỷ lệ Pass (%)", key: "pass_rate", width: 18 },
    ];
    quizSheet.addRows(
      quizStats.map((q) => ({
        quiz_id: q.quiz_id,
        quiz_title: q.quiz_title,
        total_results: Number(q.total_results) || 0,
        avg_score: Number(q.avg_score?.toFixed(2)) || 0,
        total_passed: Number(q.total_passed) || 0,
        pass_rate:
          Number(q.total_results) > 0
            ? Math.round(
                (Number(q.total_passed) / Number(q.total_results)) * 100
              )
            : 0,
      }))
    );

    const studentSheet = workbook.addWorksheet("Chi tiết học viên");
    studentSheet.columns = [
      { header: "Tên học viên", key: "student_name", width: 25 },
      { header: "Quiz", key: "quiz_title", width: 35 },
      { header: "Điểm", key: "score", width: 12 },
      { header: "Pass", key: "is_passed", width: 10 },
      { header: "Ngày nộp", key: "completed_at", width: 20 },
    ];
    studentSheet.addRows(
      studentResults.map((r) => ({
        student_name: r.student_name,
        quiz_title: r.quiz_title,
        score: Number(r.score)?.toFixed(2),
        is_passed: r.is_passed ? "Pass" : "Fail",
        completed_at: new Date(r.completed_at).toLocaleString(),
      }))
    );

    // format
    ExcelFormatter.formatSheet(summarySheet);
    ExcelFormatter.formatSheet(quizSheet);
    ExcelFormatter.formatSheet(studentSheet);

    const buffer = await workbook.xlsx.writeBuffer();
    const nodeBuffer = Buffer.from(buffer);
    return nodeBuffer;
  }
}
