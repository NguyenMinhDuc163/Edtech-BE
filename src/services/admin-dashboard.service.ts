import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { AdminDashboardQueryDto } from "src/schema/dtos/admin-dashboard.dto";
import { CourseApproval } from "src/schema/entities/course-approval.entity";
import { CourseRegistration } from "src/schema/entities/course-registration.entity";
import { Course, CourseStatus } from "src/schema/entities/course.entity";
import { QuizAttempt } from "src/schema/entities/quiz-attempt.entity";
import { User } from "src/schema/entities/user.entity";
import { DashboardHelper } from "src/utils/helper/dashboard.helper";
import { Repository } from "typeorm";

@Injectable()
export class AdminDashboardService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(CourseRegistration)
    private readonly registrationRepo: Repository<CourseRegistration>,
    @InjectRepository(QuizAttempt) private attemptRepo: Repository<QuizAttempt>,
    @InjectRepository(Course) private courseRepo: Repository<Course>
  ) { }

  async getOverview(query: AdminDashboardQueryDto) {
    const { from, to } = query;

    const revenueQuery = this.registrationRepo
      .createQueryBuilder("reg")
      .select("SUM(reg.amount_paid)", "totalRevenue")
      .addSelect("COUNT(reg.registration_id)", "totalOrders")
      .where("reg.payment_status = 'PAID'");
    DashboardHelper.applyDateRange(revenueQuery, "reg.purchase_date", from, to);

    const newStudentsQuery = this.userRepo
      .createQueryBuilder("user")
      .select("COUNT(user.id)", "count")
      .innerJoin("user.roles", "userRole")
      .innerJoin("userRole.role", "role")
      .where("role.name = 'student'");
    DashboardHelper.applyDateRange(
      newStudentsQuery,
      "user.created_at",
      from,
      to
    );

    const activeCoursesCount = await this.courseRepo.count({
      where: { status: CourseStatus.APPROVED },
    });

    const examAttemptsQuery = this.attemptRepo
      .createQueryBuilder("qa")
      .select("COUNT(qa.attempt_id)", "count");
    DashboardHelper.applyDateRange(
      examAttemptsQuery,
      "qa.started_at",
      from,
      to
    );

    const [revenueRaw, studentsRaw, attemptsRaw] = await Promise.all([
      revenueQuery.getRawOne(),
      newStudentsQuery.getRawOne(),
      examAttemptsQuery.getRawOne(),
    ]);

    return {
      totalRevenue: Number(revenueRaw?.totalRevenue || 0),
      totalPaidOrders: Number(revenueRaw?.totalOrders || 0),
      newStudents: Number(studentsRaw?.count || 0),
      activeCourses: activeCoursesCount,
      totalExamAttempts: Number(attemptsRaw?.count || 0),
    };
  }

  async getDetails(query: AdminDashboardQueryDto) {
    const { from, to, granularity = "day" } = query;
    const groupBy = DashboardHelper.getGroupingExpression;

    const revenueChartQuery = this.registrationRepo
      .createQueryBuilder("reg")
      .select(groupBy("reg.purchase_date", granularity), "period")
      .addSelect("SUM(reg.amount_paid)", "revenue")
      .where("reg.payment_status = 'PAID'");
    DashboardHelper.applyDateRange(
      revenueChartQuery,
      "reg.purchase_date",
      from,
      to
    );
    revenueChartQuery.groupBy("period").orderBy("period", "ASC");

    const userGrowthQuery = this.userRepo
      .createQueryBuilder("user")
      .select(groupBy("user.created_at", granularity), "period")
      .addSelect("COUNT(user.id)", "count")
      .innerJoin("user.roles", "userRole")
      .innerJoin("userRole.role", "role")
      .where("role.name = 'student'");
    DashboardHelper.applyDateRange(
      userGrowthQuery,
      "user.created_at",
      from,
      to
    );
    userGrowthQuery.groupBy("period").orderBy("period", "ASC");

    const topCoursesQuery = this.registrationRepo
      .createQueryBuilder("reg")
      .select("c.title", "courseTitle")
      .addSelect("COUNT(reg.registration_id)", "sales_count")
      .addSelect("SUM(reg.amount_paid)", "totalRevenue")
      .innerJoin("reg.course", "c")
      .where("reg.payment_status = 'PAID'");
    DashboardHelper.applyDateRange(
      topCoursesQuery,
      "reg.purchase_date",
      from,
      to
    );
    topCoursesQuery
      .groupBy("c.course_id, c.title")
      .orderBy("sales_count", "DESC")
      .limit(5);

    const [revenueChart, userGrowthChart, topCourses] = await Promise.all([
      revenueChartQuery.getRawMany(),
      userGrowthQuery.getRawMany(),
      topCoursesQuery.getRawMany(),
    ]);

    return {
      charts: {
        revenue: revenueChart,
        userGrowth: userGrowthChart,
      },
      rankings: {
        topCourses,
      },
    };
  }

  async getExamStats(query: AdminDashboardQueryDto) {
    const { from, to, granularity = "day" } = query;
    const groupBy = DashboardHelper.getGroupingExpression;

    const baseQuery = this.attemptRepo
      .createQueryBuilder("qa")
      .where("qa.submitted_at IS NOT NULL");
    DashboardHelper.applyDateRange(baseQuery, "qa.started_at", from, to);

    const kpiQuery = baseQuery
      .clone()
      .select("COUNT(qa.attempt_id)", "total_attempts")
      .addSelect("AVG(qa.score)", "averageScore")
      .addSelect("AVG(qa.time_spent_minutes)", "avgTimeSpent")
      .addSelect(
        `SUM(CASE WHEN qa.is_passed = true THEN 1 ELSE 0 END) * 100.0 / COUNT(qa.attempt_id)`,
        "passRate"
      );

    const scoreTrendQuery = baseQuery
      .clone()
      .select(groupBy("qa.started_at", granularity), "period")
      .addSelect('ROUND(AVG(qa.score)::numeric, 2)', 'avgScore')
      .groupBy("period")
      .orderBy("period", "ASC");

    const hardQuizzesQuery = this.attemptRepo
      .createQueryBuilder("qa")
      .select("qb.quiz_title", "quizTitle")
      .addSelect("COUNT(qa.attempt_id)", "attempts")
      .addSelect('ROUND(AVG(qa.score)::numeric, 2)', 'avgScore')
      .addSelect(
        `ROUND(
          SUM(CASE WHEN qa.is_passed = false THEN 1 ELSE 0 END) 
          * 100.0 / NULLIF(COUNT(qa.attempt_id), 0)
          , 2)`,
        "failRate"
      )
      .innerJoin("qa.questionBank", "qb")
      .where("qa.submitted_at IS NOT NULL")
      .groupBy("qa.question_bank_id, qb.quiz_title")
      .having("COUNT(qa.attempt_id) > 5")
      .orderBy('"failRate"', "DESC")
      .limit(5);

    const topStudentsQuery = this.attemptRepo
      .createQueryBuilder("qa")
      .select("u.full_name", "studentName")
      .addSelect("u.email", "studentEmail")
      .addSelect("COUNT(qa.attempt_id)", "total_attempts")
      .addSelect('ROUND(AVG(qa.score)::numeric, 2)', 'avgScore')
      .innerJoin("qa.student", "u")
      .groupBy("u.id, u.full_name, u.email")
      .orderBy("total_attempts", "DESC")
      .limit(5);

    const [kpi, scoreTrend, hardQuizzes, topStudents] = await Promise.all([
      kpiQuery.getRawOne(),
      scoreTrendQuery.getRawMany(),
      hardQuizzesQuery.getRawMany(),
      topStudentsQuery.getRawMany(),
    ]);

    return {
      summary: {
        totalAttempts: Number(kpi?.total_attempts || 0),
        averageScore: Number(Number(kpi?.averageScore).toFixed(2)),
        avgTimeSpentMinutes: Number(Math.round(kpi?.avgTimeSpent || 0)),
        passRate: Number(Number(kpi?.passRate).toFixed(2)),
      },
      charts: {
        scoreTrend,
      },
      insights: {
        hardestQuizzes: hardQuizzes,
        topActiveStudents: topStudents,
      },
    };
  }
}
