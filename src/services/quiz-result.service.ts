import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { QuizResult } from "src/schema/entities/quiz-result.entity";
import {
  LeaderboardQueryDto,
  LeaderboardSortBy,
} from "src/schema/dtos/leaderboard-query.dto";
import { FilterResultsStudentDto } from "src/schema/dtos/filter-results.dto";

@Injectable()
export class QuizResultService {
  constructor(
    @InjectRepository(QuizResult)
    private readonly resultRepo: Repository<QuizResult>
  ) {}

  async getResults(filter: any) {
    const page = Number(filter.page) > 0 ? Number(filter.page) : 1;
    const limit = Number(filter.limit) > 0 ? Number(filter.limit) : 10;
    const skip = (page - 1) * limit;

    const query = this.resultRepo
      .createQueryBuilder("result")
      .leftJoin("result.student", "student")
      .leftJoin("result.questionBank", "questionBank")
      .leftJoin("questionBank.content", "content")
      .leftJoin("content.course", "course")
      .select([
        "result.result_id",
        "result.attempt_number",
        "result.score",
        "result.completed_at",
        "result.status",
        "result.is_passed",
        "student.id",
        "student.username",
        "questionBank.question_bank_id",
        "questionBank.quiz_title",
      ])
      .orderBy("result.completed_at", "DESC")
      .skip(skip)
      .take(limit);

    if (filter.courseId)
      query.andWhere("course.course_id = :courseId", {
        courseId: filter.courseId,
      });
    if (filter.studentId)
      query.andWhere("student.id = :studentId", {
        studentId: filter.studentId,
      });
    if (filter.quizId)
      query.andWhere("questionBank.question_bank_id = :quizId", {
        quizId: filter.quizId,
      });
    if (filter.status)
      query.andWhere("result.status = :status", { status: filter.status });

    const [results, total] = await query.getManyAndCount();

    const mapped = results.map((r) => ({
      result_id: r.result_id,
      attempt_number: r.attempt_number,
      score: r.score,
      completed_at: r.completed_at,
      status: r.status,
      is_passed: r.is_passed,
      student: r.student
        ? { id: r.student.id, username: r.student.username }
        : null,
      quiz: r.questionBank
        ? {
            question_bank_id: r.questionBank.question_bank_id,
            quiz_title: r.questionBank.quiz_title,
          }
        : null,
    }));

    return {
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      data: mapped,
    };
  }

  async getLeaderboard(query: LeaderboardQueryDto): Promise<any> {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const qb = this.resultRepo
      .createQueryBuilder("result")
      .leftJoin("result.student", "student")
      .leftJoin("result.questionBank", "questionBank")
      .leftJoin("questionBank.content", "content")
      .leftJoin("content.course", "course")
      .where("result.status = :status", { status: "COMPLETED" });

    if (query.courseId)
      qb.andWhere("course.course_id = :courseId", { courseId: query.courseId });
    if (query.quizId)
      qb.andWhere("questionBank.question_bank_id = :quizId", {
        quizId: query.quizId,
      });

    qb.select("student.id", "student_id")
      .addSelect("student.username", "username")
      .addSelect("COUNT(result.result_id)", "completed_quizzes")
      .addSelect("AVG(result.score)", "avg_score")
      .addSelect("SUM(result.score)", "total_score")
      .addSelect(
        "SUM(CASE WHEN result.is_passed THEN 1 ELSE 0 END)",
        "passed_count"
      )
      .addGroupBy("student.id")
      .addGroupBy("student.username");

    switch (query.sortBy) {
      case LeaderboardSortBy.AVG_SCORE:
        qb.orderBy("avg_score", query.order);
        break;
      case LeaderboardSortBy.COMPLETED_QUIZZES:
        qb.orderBy("completed_quizzes", query.order);
        break;
      case LeaderboardSortBy.PASS_RATE:
        qb.addSelect(
          "ROUND((SUM(CASE WHEN result.is_passed THEN 1 ELSE 0 END) * 100.0 / COUNT(result.result_id)), 2)",
          "pass_rate"
        );
        qb.orderBy("pass_rate", query.order);
        break;
      default:
        qb.orderBy("total_score", query.order);
    }

    qb.skip(skip).take(limit);

    const raw = await qb.getRawMany();
    const total = raw.length;

    return {
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      data: raw.map((r, index) => ({
        rank: skip + index + 1,
        student_id: r.student_id,
        username: r.username,
        total_score: Number(r.total_score),
        avg_score: Number(r.avg_score).toFixed(2),
        completed_quizzes: Number(r.completed_quizzes),
        pass_rate: r.pass_rate ? Number(r.pass_rate) : null,
      })),
    };
  }

  async getResultsForStudent(
    studentId: string,
    filter: FilterResultsStudentDto
  ) {
    const courseStats = await this.resultRepo
      .createQueryBuilder("qr")
      .leftJoin("qr.questionBank", "qb")
      .leftJoin("qb.content", "content")
      .leftJoin("content.course", "course")
      .select([
        "course.course_id AS course_id",
        "course.title AS course_title",
        "COUNT(qr.result_id) AS total_quizzes",
        "AVG(qr.score)::float AS avg_score",
        "SUM(CASE WHEN qr.is_passed THEN 1 ELSE 0 END)::int AS total_passed",
      ])
      .where("qr.student_id = :studentId", { studentId })
      .andWhere(filter.courseId ? "course.course_id = :courseId" : "1=1", {
        courseId: filter.courseId,
      })
      .groupBy("course.course_id")
      .addGroupBy("course.title")
      .orderBy("course.title", "ASC")
      .getRawMany();

    const result = await this.resultRepo
      .createQueryBuilder("qr")
      .select([
        "COUNT(qr.result_id)::int AS total_results",
        "AVG(qr.score)::float AS avg_score",
        "SUM(CASE WHEN qr.is_passed THEN 1 ELSE 0 END)::int AS total_passed",
      ])
      .where("qr.student_id = :studentId", { studentId });

    if (filter.courseId) {
      result
        .leftJoin("qr.questionBank", "qb")
        .leftJoin("qb.content", "content")
        .leftJoin("content.course", "course")
        .andWhere("course.course_id = :courseId", {
          courseId: filter.courseId,
        });
    }

    const overall = await result.getRawOne();

    const recentResults = await this.resultRepo
      .createQueryBuilder("qr")
      .leftJoin("qr.questionBank", "qb")
      .select([
        "qr.result_id AS result_id",
        "qb.quiz_title AS quiz_title",
        "qr.score AS score",
        "qr.is_passed AS is_passed",
        "qr.completed_at AS completed_at",
      ])
      .where("qr.student_id = :studentId", { studentId })
      .orderBy("qr.completed_at", "DESC")
      .limit(5)
      .getRawMany();

    if (!overall || Number(overall.total_results) === 0) {
      return {
        overview: {
          total_results: 0,
          average_score: 0,
          total_passed: 0,
        },
        courses: [],
        recent_results: [],
      };
    }

    return {
      overview: {
        total_results: Number(overall.total_results) || 0,
        average_score: Number(overall.avg_score?.toFixed(2)) || 0,
        total_passed: Number(overall.total_passed) || 0,
      },
      courses: courseStats.map((c) => ({
        course_id: c.course_id,
        title: c.course_title,
        total_quizzes: Number(c.total_quizzes),
        avg_score: Number(c.avg_score?.toFixed(2)) || 0,
        pass_rate:
          c.total_quizzes > 0
            ? Math.round((c.total_passed / c.total_quizzes) * 100)
            : 0,
      })),
      recent_results: recentResults,
    };
  }

  async getTopStudents(query: {
    courseId?: string;
    quizId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const qb = this.resultRepo
      .createQueryBuilder("result")
      .leftJoin("result.student", "student")
      .leftJoin("result.questionBank", "questionBank")
      .leftJoin("questionBank.content", "content")
      .leftJoin("content.course", "course")
      .where("result.status = :status", { status: "COMPLETED" });

    if (query.courseId) {
      qb.andWhere("course.course_id = :courseId", {
        courseId: query.courseId,
      });
    }

    if (query.quizId) {
      qb.andWhere("questionBank.question_bank_id = :quizId", {
        quizId: query.quizId,
      });
    }

    qb.select("student.id", "student_id")
      .addSelect("student.username", "username")
      .addSelect("student.email", "email")
      .addSelect("SUM(result.score)", "total_score")
      .addSelect("AVG(result.score)", "avg_score")
      .addSelect("COUNT(result.result_id)", "completed_quizzes")
      .groupBy("student.id")
      .addGroupBy("student.username")
      .addGroupBy("student.email")
      .orderBy("total_score", "DESC")
      .skip(skip)
      .take(limit);

    const raw = await qb.getRawMany();
    const totalQb = this.resultRepo
      .createQueryBuilder("result")
      .leftJoin("result.student", "student")
      .leftJoin("result.questionBank", "questionBank")
      .leftJoin("questionBank.content", "content")
      .leftJoin("content.course", "course")
      .where("result.status = :status", { status: "COMPLETED" });

    if (query.courseId) {
      totalQb.andWhere("course.course_id = :courseId", {
        courseId: query.courseId,
      });
    }

    if (query.quizId) {
      totalQb.andWhere("questionBank.question_bank_id = :quizId", {
        quizId: query.quizId,
      });
    }

    totalQb
      .select("student.id", "student_id")
      .groupBy("student.id");

    const totalStudents = await totalQb.getRawMany();
    const total = totalStudents.length;

    return {
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      data: raw.map((r, index) => ({
        rank: skip + index + 1,
        student_id: r.student_id,
        username: r.username,
        email: r.email,
        total_score: Number(r.total_score),
        avg_score: Number(r.avg_score).toFixed(2),
        completed_quizzes: Number(r.completed_quizzes),
      })),
    };
  }
}
