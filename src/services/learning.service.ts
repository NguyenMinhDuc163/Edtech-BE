import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In, DataSource, QueryRunner } from "typeorm";
import {
  LearningAction,
  LearningLog,
} from "../schema/entities/learning-log.entity";
import { CourseRegistration } from "../schema/entities/course-registration.entity";
import { CourseContent } from "../schema/entities/course-content.entity";
import {
  MasteryStatus,
  UserContentMastery,
} from "src/schema/entities/user-content-mastery.entity";
import { UpdateProgressDto } from "src/schema/dtos/update-progress.dto";
import { StorageService } from "./storage.service";
import { MasteryCalculator } from "src/utils/mastery-calculator";

@Injectable()
export class LearningService {
  constructor(
    private dataSource: DataSource,
    @InjectRepository(CourseRegistration)
    private regRepo: Repository<CourseRegistration>,
    @InjectRepository(CourseContent)
    private contentRepo: Repository<CourseContent>,
    @InjectRepository(UserContentMastery)
    private masteryRepo: Repository<UserContentMastery>,
    private storageService: StorageService,
    @InjectRepository(LearningLog)
    private logRepo: Repository<LearningLog>
  ) {}

  async updateProgress(userId: string, dto: UpdateProgressDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const lastLog = await queryRunner.manager.findOne(LearningLog, {
        where: {
          student_id: userId,
          content_id: dto.contentId,
        },
        order: { end_time: "DESC" },
      });

      const now = new Date();
      const SESSION_TIMEOUT = 20 * 60 * 1000; // 20p
      let isNewSession = true;

      if (lastLog) {
        const timeDiff = now.getTime() - new Date(lastLog.end_time).getTime();

        if (
          timeDiff < SESSION_TIMEOUT &&
          dto.action !== LearningAction.VIDEO_START
        ) {
          isNewSession = false;

          lastLog.end_time = now;
          lastLog.duration_sec += dto.durationWatched;

          lastLog.metadata = {
            ...lastLog.metadata,
            videoTimestamp: dto.videoTimestamp,
          };

          if (dto.action === LearningAction.VIDEO_COMPLETE) {
            lastLog.action = LearningAction.VIDEO_COMPLETE;
          }

          await queryRunner.manager.save(lastLog);
        }
      }

      if (isNewSession) {
        const newLog = new LearningLog();
        newLog.student_id = userId;
        newLog.course_id = dto.courseId;
        newLog.content_id = dto.contentId;
        newLog.action = dto.action;
        newLog.start_time = now;
        newLog.end_time = now;
        newLog.duration_sec = dto.durationWatched;
        newLog.metadata = { videoTimestamp: dto.videoTimestamp };

        await queryRunner.manager.save(newLog);
      }

      let mastery = await queryRunner.manager.findOne(UserContentMastery, {
        where: { user_id: userId, content_id: dto.contentId },
      });

      if (!mastery) {
        mastery = new UserContentMastery();
        mastery.user_id = userId;
        mastery.content_id = dto.contentId;
        mastery.status = MasteryStatus.IN_PROGRESS;
      }

      mastery.last_playback_position = dto.videoTimestamp;

      const durationInput = Number(dto.durationWatched);
      const safeDuration = isNaN(durationInput) ? 0 : durationInput;

      const currentTotal = Number(mastery.total_time_spent) || 0;

      mastery.total_time_spent = currentTotal + safeDuration;

      if (dto.totalDuration && dto.totalDuration > 0) {
        const percent = (dto.videoTimestamp / dto.totalDuration) * 100;
        if (percent > mastery.progress_percent) {
          mastery.progress_percent = parseFloat(percent.toFixed(2));
        }
      }

      if (
        dto.action === LearningAction.VIDEO_COMPLETE ||
        mastery.progress_percent >= 95
      ) {
        const masteryCalculator = new MasteryCalculator();
        const updateData = masteryCalculator.calculateLearningUpdate(
          mastery,
          100
        );

        if (updateData.theta !== undefined) mastery.theta = updateData.theta;
        if (updateData.certainty !== undefined)
          mastery.certainty = updateData.certainty;
        if (updateData.status !== undefined) mastery.status = updateData.status;

        mastery.last_updated = new Date();

        const wasCompleted = mastery.is_completed;
        mastery.is_completed = true;
        mastery.progress_percent = 100;
        await queryRunner.manager.save(mastery);

        if (!wasCompleted) {
          await this.updateCourseRegistrationProgress(
            queryRunner,
            userId,
            dto.courseId
          );
        }
      } else {
        await queryRunner.manager.save(mastery);
      }

      await queryRunner.commitTransaction();

      return { success: true };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async getCourseProgress(userId: string, courseId: string) {
    const contents = await this.contentRepo.find({
      where: { courses_id: courseId },
      order: { content_id: "ASC" },
    });

    if (contents.length === 0) {
      return {
        courseProgress: 0,
        lessons: [],
      };
    }

    const contentIds = contents.map((c) => c.content_id);

    const masteries = await this.masteryRepo.find({
      where: {
        user_id: userId,
        content_id: In(contentIds),
      },
    });

    const masteryMap = new Map(masteries.map((m) => [m.content_id, m]));

    const lessons = contents.map((content) => {
      const m = masteryMap.get(content.content_id);
      return {
        contentId: content.content_id,
        title: content.title,
        isCompleted: m?.is_completed || false,
        progressPercentage: m?.progress_percent || 0,
        lastPosition: m?.last_playback_position || 0,
        status: m?.status || MasteryStatus.UNLOCKED,
      };
    });

    const completedCount = lessons.filter((l) => l.isCompleted).length;
    const courseProgress = parseFloat(
      ((completedCount / contents.length) * 100).toFixed(2)
    );

    return {
      courseId,
      courseProgress,
      totalLessons: contents.length,
      completedLessons: completedCount,
      lessons,
    };
  }

  async getOverallProgress(userId: string) {
    const registrations = await this.regRepo.find({
      where: { user_id: userId },
      relations: ["course"],
    });

    if (registrations.length === 0) {
      return {
        totalCourses: 0,
        completedCourses: 0,
        totalLessons: 0,
        completedLessons: 0,
        overallProgress: 0,
        courses: [],
      };
    }

    const totalContentsRaw = await this.contentRepo
      .createQueryBuilder("c")
      .select("c.courses_id", "courseId")
      .addSelect("COUNT(c.content_id)", "total")
      .where("c.courses_id IN (:...ids)", {
        ids: registrations.map((r) => r.course_id),
      })
      .groupBy("c.courses_id")
      .getRawMany();

    const totalMap = new Map(
      totalContentsRaw.map((r) => [r.courseId, parseInt(r.total)])
    );

    const completedRaw = await this.masteryRepo
      .createQueryBuilder("m")
      .innerJoin("m.content", "c")
      .select("c.courses_id", "courseId")
      .addSelect("COUNT(m.content_id)", "completed")
      .where("m.user_id = :userId", { userId })
      .andWhere("m.is_completed = true")
      .andWhere("c.courses_id IN (:...ids)", {
        ids: registrations.map((r) => r.course_id),
      })
      .groupBy("c.courses_id")
      .getRawMany();

    const completedMap = new Map(
      completedRaw.map((r) => [r.courseId, parseInt(r.completed)])
    );

    let grandTotalLessons = 0;
    let grandTotalCompleted = 0;

    const coursesData = await Promise.all(
      registrations.map(async (reg) => {
        const total = totalMap.get(reg.course_id) || 0;
        const completed = completedMap.get(reg.course_id) || 0;
        const progress =
          total > 0 ? parseFloat(((completed / total) * 100).toFixed(2)) : 0;

        grandTotalLessons += total;
        grandTotalCompleted += completed;

        let thumbnailUrl: string | null = null;
        if (reg.course?.thumbnail_url) {
          try {
            thumbnailUrl = await this.storageService.generateSasUrlFromUrl(
              reg.course.thumbnail_url,
              "image",
              24 // Hết hạn sau 24h
            );
          } catch (error) {
            console.error(`Lỗi tạo SAS cho khóa học ${reg.course_id}:`, error);
            thumbnailUrl = null; // Fallback nếu lỗi
          }
        }

        return {
          courseId: reg.course_id,
          courseName: reg.course?.title,
          thumbnail: thumbnailUrl,
          progress,
          totalLessons: total,
          completedLessons: completed,
        };
      })
    );

    const overallProgress =
      grandTotalLessons > 0
        ? parseFloat(
            ((grandTotalCompleted / grandTotalLessons) * 100).toFixed(2)
          )
        : 0;

    return {
      overview: {
        totalCourses: registrations.length,
        completedCourses: coursesData.filter((c) => c.progress === 100).length,
        inProgressCourses: coursesData.filter(
          (c) => c.progress > 0 && c.progress < 100
        ).length,
        overallProgress,
        totalTimeSpent: 0,
      },
      courses: coursesData,
    };
  }

  private async updateCourseRegistrationProgress(
    queryRunner: QueryRunner,
    userId: string,
    courseId: string
  ) {
    const totalContent = await queryRunner.manager.count(CourseContent, {
      where: { courses_id: courseId },
    });

    if (totalContent === 0) {
      await queryRunner.manager.update(
        CourseRegistration,
        { user_id: userId, course_id: courseId },
        { progress: 0 }
      );
      return;
    }

    const completedContent = await queryRunner.manager
      .createQueryBuilder(UserContentMastery, "mastery")
      .innerJoin("mastery.content", "content")
      .where("mastery.user_id = :userId", { userId })
      .andWhere("content.courses_id = :courseId", { courseId })
      .andWhere("mastery.is_completed = :isCompleted", { isCompleted: true })
      .getCount();

    const rawProgress = (completedContent / totalContent) * 100;

    const progress = parseFloat(rawProgress.toFixed(2));

    const updateData: any = { progress: progress };

    if (progress >= 100) {
      updateData.completed_at = new Date();
      updateData.status = "COMPLETED";
    }

    await queryRunner.manager.update(
      CourseRegistration,
      { user_id: userId, course_id: courseId },
      updateData
    );
  }

  async getLastWatchedLesson(userId: string, courseId: string) {
    const lastLog = await this.logRepo.findOne({
      where: {
        student_id: userId,
        course_id: courseId,
      },
      order: {
        end_time: "DESC",
      },
    });

    if (!lastLog) {
      return {
        contentId: 0,
      };
    }

    return {
      contentId: lastLog.content_id,
    };
  }
}
