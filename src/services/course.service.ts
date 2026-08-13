import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, Repository } from "typeorm";
import {
  Course,
  CourseCategory,
  CourseStatus,
  CourseVisibility,
} from "../schema/entities/course.entity";
import { CourseContent } from "../schema/entities/course-content.entity";
import { CreateCourseDto } from "../schema/dtos/create-course.dto";
import { UpdateCourseDto } from "../schema/dtos/update-course.dto";
import {
  CourseApproval,
  ApprovalStatus,
} from "../schema/entities/course-approval.entity";
import { AdminGetCoursesDto } from "src/schema/dtos/admin-get-courses.dto";
import { CourseSection } from "src/schema/entities/course-section.entity";
import { UserContentMastery } from "src/schema/entities/user-content-mastery.entity";
import { ContentRelationship, RelationshipType } from "src/schema/entities/content_relationships.entity";
import { QuizResult } from "src/schema/entities/quiz-result.entity";
import { QuestionBank } from "src/schema/entities/question-bank.entity";
import ExcelJS from "exceljs";
import { ExcelFormatter } from "src/constants/utils/excelFormat";
import { StorageService } from "./storage.service";
import { CourseRegistration } from "../schema/entities/course-registration.entity";
import { CourseReview } from "../schema/entities/course-review.entity";
import { ContentFile } from "src/schema/entities/content-file.entity";
import { CourseAccessService } from "./course-access.service";
import { CourseStoreProduct } from "../schema/entities/course-store-product.entity";

@Injectable()
export class CourseService {
  constructor(
    @InjectRepository(Course)
    private readonly courseRepo: Repository<Course>,
    @InjectRepository(CourseContent)
    private readonly contentRepo: Repository<CourseContent>,
    @InjectRepository(CourseApproval)
    private readonly approvalRepo: Repository<CourseApproval>,
    @InjectRepository(QuizResult)
    private readonly resultRepo: Repository<QuizResult>,
    @InjectRepository(QuestionBank)
    private quizRepository: Repository<QuestionBank>,
    @InjectRepository(CourseRegistration)
    private readonly registrationRepo: Repository<CourseRegistration>,
    @InjectRepository(CourseReview)
    private readonly reviewRepo: Repository<CourseReview>,
    private readonly storageService: StorageService,
    @InjectRepository(CourseRegistration)
    private readonly courseRegistrationRepo: Repository<CourseRegistration>,
    @InjectRepository(CourseSection)
    private readonly sectionRepo: Repository<CourseSection>,
    @InjectRepository(UserContentMastery)
    private readonly masteryRepo: Repository<UserContentMastery>,
    @InjectRepository(ContentRelationship)
    private readonly relationRepo: Repository<ContentRelationship>,
    @InjectRepository(CourseStoreProduct)
    private readonly storeProductRepo: Repository<CourseStoreProduct>,
    @InjectRepository(ContentFile)
    private readonly contentFileRepo: Repository<ContentFile>,
    private readonly courseAccessService: CourseAccessService,
    private readonly dataSource: DataSource,
  ) { }

  async create(
    createDto: CreateCourseDto,
    ownerId: string | null
  ): Promise<Course> {
    if (!ownerId) {
      throw new ForbiddenException("Thiếu thông tin người tạo");
    }

    const course = this.courseRepo.create({
      title: createDto.title,
      description: createDto.description ?? null,
      price: String(createDto.price.toFixed(2)),
      category: createDto.category ?? CourseCategory.PROGRAMMING_FOUNDATION,
      currency: createDto.currency,
      visibility: createDto.visibility ?? CourseVisibility.PRIVATE,
      status: CourseStatus.DRAFT,
      user_id: ownerId,
      course_duration: createDto.courseDuration ?? null,
      teacher: createDto.teacher ?? null,
      discount_amount: createDto.discountAmount
        ? String(createDto.discountAmount.toFixed(2))
        : "0",
      course_description: createDto.courseDescription ?? null,
      thumbnail_url: createDto.thumbnailUrl ?? null,
      is_paid: createDto.isPaid ?? createDto.price > 0,
      mobile_iap_enabled: false,
    });

    return await this.courseRepo.save(course);
  }

  async update(
    courseId: string,
    ownerId: string | null,
    dto: UpdateCourseDto
  ): Promise<Course> {
    if (!ownerId) {
      throw new ForbiddenException("Thiếu thông tin người sửa");
    }

    const course = await this.courseRepo.findOne({
      where: { course_id: courseId },
    });
    if (!course) {
      throw new BadRequestException("Khóa học không tồn tại");
    }
    if (course.user_id !== ownerId) {
      throw new ForbiddenException("Bạn không có quyền sửa khóa học này");
    }

    if (dto.title !== undefined) course.title = dto.title;
    if (dto.description !== undefined)
      course.description = dto.description ?? null;
    if (dto.category !== undefined)
      course.category = dto.category ?? CourseCategory.PROGRAMMING_FOUNDATION;
    if (dto.price !== undefined) course.price = String(dto.price.toFixed(2));
    if (dto.currency !== undefined) course.currency = dto.currency;
    if (dto.visibility !== undefined) course.visibility = dto.visibility;
    if (dto.courseDuration !== undefined)
      course.course_duration = dto.courseDuration ?? null;
    if (dto.teacher !== undefined) course.teacher = dto.teacher ?? null;
    if (dto.discountAmount !== undefined)
      course.discount_amount = String(dto.discountAmount.toFixed(2));
    if (dto.courseDescription !== undefined)
      course.course_description = dto.courseDescription ?? null;
    if (dto.thumbnailUrl !== undefined)
      course.thumbnail_url = dto.thumbnailUrl ?? null;
    if (dto.isPaid !== undefined) course.is_paid = dto.isPaid;
    if (dto.mobileIapEnabled !== undefined) {
      if (!course.is_paid && dto.mobileIapEnabled) {
        throw new BadRequestException("Khóa học miễn phí không thể bật IAP");
      }
      if (dto.mobileIapEnabled) {
        const activeProducts = await this.storeProductRepo.count({
          where: { course_id: courseId, is_active: true },
        });
        if (!activeProducts) {
          throw new BadRequestException(
            "Chưa có store product active cho khóa học",
          );
        }
      }
      course.mobile_iap_enabled = dto.mobileIapEnabled;
    }
    if (!course.is_paid) course.mobile_iap_enabled = false;

    return await this.courseRepo.save(course);
  }

  async updateThumbnailUrl(courseId: string, thumbnailUrl: string): Promise<void> {
    const course = await this.courseRepo.findOne({
      where: { course_id: courseId },
    });
    if (!course) {
      throw new NotFoundException("Khóa học không tồn tại");
    }
    course.thumbnail_url = thumbnailUrl;
    await this.courseRepo.save(course);
  }

  async getDetail(courseId: string) {
    const course = await this.courseRepo.findOne({
      where: { course_id: courseId },
    });
    if (!course) {
      throw new BadRequestException("Khóa học không tồn tại");
    }

    const contents = await this.contentRepo.find({
      where: { courses_id: courseId },
      relations: ["section"],
    });
    const sectionMap = new Map<string, any>();

    contents.forEach((c, idx) => {
      const sectionId = c.section?.section_id
        ? String(c.section.section_id)
        : "no-section";
      if (!sectionMap.has(sectionId)) {
        sectionMap.set(sectionId, {
          sectionId,
          title: c.section?.title,
          order: c.section?.order_index,
          lessons: [],
        });
      }
      sectionMap.get(sectionId).lessons.push({
        lessonId: String(c.content_id),
        title: c.title,
        type: "content",
        order: idx + 1,
        filesCount: c.files?.length || 0,
      });
    });

    const sections = Array.from(sectionMap.values()).sort(
      (a, b) => a.order - b.order
    );

    let thumbnailUrlWithSas: string | null = course.thumbnail_url;
    if (course.thumbnail_url) {
      try {
        thumbnailUrlWithSas = await this.storageService.generateSasUrlFromUrl(
          course.thumbnail_url,
          "image",
          1
        );
      } catch (error) {
        console.error("Failed to generate SAS token for thumbnail:", error);
      }
    }

    return {
      courseId: String(course.course_id),
      title: course.title,
      description: course.description,
      price: course.price,
      currency: course.currency,
      category: course.category,
      status: course.status,
      visibility: course.visibility,
      courseDuration: course.course_duration,
      userId: course.user_id,
      teacher: course.teacher,
      discountAmount: course.discount_amount,
      courseDescription: course.course_description,
      thumbnailUrl: thumbnailUrlWithSas,
      createdAt: course.created_at,
      isPaid: course.is_paid,
      mobileIapEnabled: course.mobile_iap_enabled,
      sections,
    };
  }

  async listMyCourses(ownerId: string | null) {
    if (!ownerId) {
      throw new ForbiddenException("Thiếu thông tin người dùng");
    }
    const courses = await this.courseRepo.find({ where: { user_id: ownerId } });

    const coursesWithSas = await Promise.all(
      courses.map(async (c) => {
        let thumbnailUrlWithSas: string | null = c.thumbnail_url;
        if (c.thumbnail_url) {
          try {
            thumbnailUrlWithSas =
              await this.storageService.generateSasUrlFromUrl(
                c.thumbnail_url,
                "image",
                1
              );
          } catch (error) {
            console.error("Failed to generate SAS token for thumbnail:", error);
          }
        }

        return {
          courseId: String(c.course_id),
          title: c.title,
          description: c.description,
          price: c.price,
          currency: c.currency,
          category: c.category,
          status: c.status,
          visibility: c.visibility,
          courseDuration: c.course_duration,
          teacher: c.teacher,
          discountAmount: c.discount_amount,
          courseDescription: c.course_description,
          thumbnailUrl: thumbnailUrlWithSas,
          createdAt: c.created_at,
          isPaid: c.is_paid,
          mobileIapEnabled: c.mobile_iap_enabled,
        };
      })
    );

    return coursesWithSas;
  }

  async findAllPublic() {
    return await this.courseRepo.find({
      where: [
        {
          visibility: CourseVisibility.PUBLIC,
          status: CourseStatus.APPROVED,
        },

        {
          is_preview: "Y",
        },
      ],
      order: { created_at: "DESC" },
    });
  }

  async findPublicById(courseId: string) {
    return await this.courseRepo.findOne({
      where: [
        {
          course_id: courseId,
          visibility: CourseVisibility.PUBLIC,
          status: CourseStatus.APPROVED,
        },

        {
          course_id: courseId,
          is_preview: "Y",
        },
      ],
    });
  }

  async changeCourseVisibility(
    courseId: string,
    newVisibility: CourseVisibility,
    requesterId: string | null,
  ): Promise<Course> {
    if (!requesterId) {
      throw new ForbiddenException('Không xác định được người dùng');
    }

    const course = await this.courseRepo.findOne({
      where: { course_id: courseId },
      select: ['course_id', 'user_id', 'visibility', 'status', 'title', 'updated_at'],
    });

    if (!course) {
      throw new NotFoundException('Khóa học không tồn tại');
    }

    const isOwner = course.user_id === requesterId;

    if (!isOwner) {
      throw new ForbiddenException('Bạn chỉ có thể thay đổi visibility của khóa học do mình tạo');
    }
    if (course.user_id === requesterId && [CourseStatus.PENDING, CourseStatus.REJECTED].includes(course.status)) {
      throw new BadRequestException('Không thể thay đổi visibility khi khóa học đang chờ duyệt hoặc bị từ chối');
    }
    course.visibility = newVisibility;

    return await this.courseRepo.save(course);
  }

  async submitForApproval(courseId: string, ownerId: string) {
    if (!ownerId) {
      throw new ForbiddenException("Thiếu thông tin người gửi");
    }

    // Kiểm tra khóa học có tồn tại và thuộc về teacher này
    const course = await this.courseRepo.findOne({
      where: { course_id: courseId },
    });
    if (!course) {
      throw new BadRequestException("Khóa học không tồn tại");
    }
    if (course.user_id !== ownerId) {
      throw new ForbiddenException("Bạn không có quyền gửi khóa học này");
    }

    // Kiểm tra trạng thái khóa học
    if (![CourseStatus.DRAFT, CourseStatus.REJECTED].includes(course.status)) {
      throw new BadRequestException(
        "Chỉ có thể gửi khóa học khi ở trạng thái bản nháp hoặc bị từ chối"
      );
    }

    // Kiểm tra có ít nhất 1 section và 1 lesson
    const sections = await this.contentRepo.find({
      where: { courses_id: courseId },
    });
    if (!sections.length) {
      throw new BadRequestException(
        "Khóa học phải có ít nhất 1 section và 1 lesson để gửi duyệt"
      );
    }

    // Nếu trạng thái là REJECTED, kiểm tra có thay đổi gì kể từ lần bị từ chối cuối cùng
    if (course.status === CourseStatus.REJECTED) {
      const lastRejected = await this.approvalRepo.findOne({
        where: { course_id: courseId, status: ApprovalStatus.REJECTED },
        order: { rejected_at: "DESC" },
      });

      if (lastRejected && course.updated_at <= lastRejected.rejected_at!) {
        throw new BadRequestException(
          "Khóa học chưa được chỉnh sửa kể từ lần bị từ chối cuối cùng. Vui lòng cập nhật nội dung trước khi gửi lại."
        );
      }
    }

    // Cập nhật trạng thái khóa học thành PENDING
    course.status = CourseStatus.PENDING;
    await this.courseRepo.save(course);

    return {
      courseId: String(course.course_id),
      title: course.title,
      status: course.status,
      message: "Đã gửi phê duyệt thành công",
    };
  }

  async getAdminCourses(query: AdminGetCoursesDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const qb = this.courseRepo
      .createQueryBuilder("course")
      .leftJoin(
        "course.approvals",
        "approval",
        "approval.status = :approvedStatus",
        { approvedStatus: ApprovalStatus.APPROVED }
      )
      .leftJoin("approval.admin", "admin")
      .addSelect(["admin.id", "admin.username", "admin.full_name"])
      .orderBy("course.created_at", "DESC");

    if (query.status) {
      qb.andWhere("course.status = :status", { status: query.status });
    }

    if (query.visibility) {
      qb.andWhere("course.visibility = :visibility", {
        visibility: query.visibility,
      });
    }

    if (query.title) {
      qb.andWhere("course.title ILIKE :title", {
        title: `%${query.title}%`,
      });
    }

    const [courses, total] = await qb.skip(skip).take(limit).getManyAndCount();

    const totalPages = Math.ceil(total / limit);

    return {
      courses: courses.map((course) => {
        const approval = course.approvals?.[0];

        return {
          courseId: course.course_id,
          title: course.title,
          description: course.description,
          courseDescription: course.course_description,
          thumbnailUrl: course.thumbnail_url,
          category: course.category,
          duration: course.course_duration,
          courseDuration: course.course_duration,
          teacher: course.teacher,
          price: course.price,
          currency: course.currency,
          discountAmount: course.discount_amount,
          status: course.status,
          visibility: course.visibility,
          isPreview: course.is_preview,
          isPaid: course.is_paid,
          mobileIapEnabled: course.mobile_iap_enabled,
          contentEnabled: course.content_enabled,
          userId: course.user_id,
          createdAt: course.created_at,
          updatedAt: course.updated_at,
          approved_by: approval
            ? (approval.admin.full_name || approval.admin.username)
            : null,
        };
      }),
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  async updateVisibilityAsAdmin(
    courseId: string,
    visibility: CourseVisibility,
  ): Promise<Course> {
    const course = await this.courseRepo.findOne({
      where: { course_id: courseId },
    });
    if (!course) {
      throw new NotFoundException("Khóa học không tồn tại");
    }
    if (
      visibility === CourseVisibility.PUBLIC &&
      course.status !== CourseStatus.APPROVED
    ) {
      throw new BadRequestException(
        "Chỉ khóa học đã duyệt mới có thể hiển thị công khai",
      );
    }
    course.visibility = visibility;
    return this.courseRepo.save(course);
  }

  async getContentAccessAsAdmin(courseId: string) {
    const course = await this.courseRepo.findOne({
      where: { course_id: courseId },
    });
    if (!course) throw new NotFoundException("Khóa học không tồn tại");

    const sections = await this.sectionRepo.find({
      where: { course_id: courseId },
      relations: ["contents", "contents.files"],
      order: { order_index: "ASC" },
    });

    return {
      courseId: course.course_id,
      courseTitle: course.title,
      contentEnabled: course.content_enabled,
      sections: sections.map((section) => ({
        sectionId: section.section_id,
        title: section.title,
        isActive: section.is_active,
        isPreview: section.is_preview === "Y",
        contents: (section.contents ?? [])
          .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
          .map((content) => ({
            contentId: content.content_id,
            title: content.title,
            isActive: content.is_active,
            isPreview: content.is_preview === "Y",
            files: (content.files ?? [])
              .sort((a, b) => a.order_index - b.order_index)
              .map((file) => ({
                fileId: file.file_id,
                title: file.title,
                fileType: file.file_type,
                isActive: file.is_active,
              })),
          })),
      })),
    };
  }

  async updateSectionAccessAsAdmin(
    courseId: string,
    sectionId: string,
    dto: { isActive?: boolean; isPreview?: boolean },
  ) {
    const section = await this.sectionRepo.findOne({
      where: { section_id: sectionId, course_id: courseId },
    });
    if (!section) throw new NotFoundException("Section không thuộc khóa học này");
    if (dto.isActive !== undefined) section.is_active = dto.isActive;
    if (dto.isPreview !== undefined) section.is_preview = dto.isPreview ? "Y" : "N";
    return this.sectionRepo.save(section);
  }

  async updateContentAccessAsAdmin(
    courseId: string,
    contentId: string,
    dto: { isPreview?: boolean; isActive?: boolean },
  ) {
    const content = await this.contentRepo.findOne({
      where: { content_id: contentId, courses_id: courseId },
    });
    if (!content) throw new NotFoundException("Nội dung không thuộc khóa học này");
    if (dto.isPreview !== undefined) {
      content.is_preview = dto.isPreview ? "Y" : "N";
    }
    if (dto.isActive !== undefined) content.is_active = dto.isActive;
    return this.contentRepo.save(content);
  }

  async updateCourseContentEnabledAsAdmin(courseId: string, enabled: boolean) {
    const course = await this.courseRepo.findOne({
      where: { course_id: courseId },
    });
    if (!course) throw new NotFoundException("Khóa học không tồn tại");

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Course).update(
        { course_id: courseId },
        {
          content_enabled: enabled,
          ...(!enabled ? { mobile_iap_enabled: false } : {}),
        },
      );

      if (enabled) {
        await manager.getRepository(CourseSection).update(
          { course_id: courseId },
          { is_active: true },
        );
        await manager.getRepository(CourseContent).update(
          { courses_id: courseId },
          { is_active: true },
        );
        await manager.query(
          `UPDATE "content_files" SET "is_active" = true WHERE "content_id" IN (SELECT "content_id" FROM "course_contents" WHERE "courses_id" = $1)`,
          [courseId],
        );
      }
    });

    return this.getContentAccessAsAdmin(courseId);
  }

  async updateFileAccessAsAdmin(
    courseId: string,
    fileId: string,
    isActive: boolean,
  ) {
    const file = await this.contentFileRepo.findOne({
      where: { file_id: fileId },
      relations: ["content"],
    });
    if (!file || file.content.courses_id !== courseId) {
      throw new NotFoundException("Tệp không thuộc khóa học này");
    }
    file.is_active = isActive;
    return this.contentFileRepo.save(file);
  }


  async getStudentSyllabus(courseId: string, studentId: string) {
    const course = await this.courseRepo.findOne({
      where: { course_id: courseId },
    });
    if (!course) throw new NotFoundException('Khóa học không tồn tại');
    if (!course.content_enabled) {
      throw new ForbiddenException('Nội dung khóa học đang được tắt');
    }
    const access = await this.courseAccessService.resolveAccess(studentId, course);
    if (access.accessLevel !== 'FULL') {
      throw new ForbiddenException('Bạn chưa mua khóa học này hoặc đơn hàng chưa hoàn tất.');
    }
    let thumbnailUrlWithSas: string | null = course.thumbnail_url;
    if (course.thumbnail_url) {
      try {
        thumbnailUrlWithSas = await this.storageService.generateSasUrlFromUrl(
          course.thumbnail_url,
          'image',
          1
        );
      } catch (error) {
        console.error('Failed to generate SAS token for thumbnail:', error);
      }
    }

    const sections = await this.sectionRepo.find({
      where: { course_id: courseId, is_active: true },
      order: { order_index: 'ASC' }
    });

    const contents = await this.contentRepo.find({
      where: { courses_id: courseId, is_active: true },
      select: ['courses_id', 'content_id', 'title', 'description', 'section_id'],
      relations: ['files']
    });
    contents.forEach((content) => {
      content.files = (content.files ?? []).filter((file) => file.is_active);
    });
    const contentIds = contents.map(c => c.content_id);

    // A. Fetch User Mastery
    const masteries = await this.masteryRepo.find({
      where: { user_id: studentId, content_id: In(contentIds) }
    });
    const masteryMap = new Map(masteries.map(m => [m.content_id, m]));

    // B. Fetch Relationships
    const relationships = await this.relationRepo.find({
      where: [
        { child_content_id: In(contentIds) },
        { parent_content_id: In(contentIds) }
      ]
    });

    // C. Processing Loop 
    const adaptiveContents = await Promise.all(contents.map(async (content) => {
      const processedContent: any = { ...content };

      const myMastery = masteryMap.get(content.content_id);
      const myTheta = myMastery?.theta ?? 0;

      processedContent.mastery_level = myTheta;
      processedContent.adaptive_status = 'NEUTRAL';

      // RULE 1: MASTERED
      if (myTheta >= 2.0) {
        processedContent.adaptive_status = 'MASTERED';
      } else {
        // RULE 2: PREREQUISITE CHECK
        const prerequisites = relationships.filter(r =>
          r.child_content_id === content.content_id &&
          r.relation_type === RelationshipType.PREREQUISITE
        );

        let isWarning = false;
        for (const prereq of prerequisites) {
          const parentMastery = masteryMap.get(prereq.parent_content_id);
          const parentTheta = parentMastery?.theta ?? 0;
          if (parentTheta < 0) {
            processedContent.adaptive_status = 'WARNING';
            processedContent.warning_message = `Cần học bài ID ${prereq.parent_content_id} trước.`;
            isWarning = true;
            break;
          }
        }

        // RULE 3: REMEDIAL RECOMMENDATION
        if (!isWarning) {
          const remedialSources = relationships.filter(r =>
            r.child_content_id === content.content_id &&
            r.relation_type === RelationshipType.REMEDIAL
          );
          for (const source of remedialSources) {
            const parentMastery = masteryMap.get(source.parent_content_id);
            if (parentMastery && parentMastery.theta < -1.0) {
              processedContent.adaptive_status = 'RECOMMENDED';
              processedContent.recommendation_reason = `Gợi ý bổ trợ kiến thức.`;
              break;
            }
          }
        }
      }

      if (content.files && content.files.length > 0) {
        processedContent.files = await Promise.all(content.files.map(async (file) => {
          let secureUrl = null;
          try {
            secureUrl = await this.storageService.generateSasUrlFromUrl(
              file.url,
              file.file_type
            );
          } catch (e) {
            console.error(`Error SAS URL for file ${file.file_id}`, e);
          }

          return {
            fileId: String(file.file_id),
            title: file.title,
            fileType: file.file_type,
            url: secureUrl
          };
        }));
      }

      return processedContent;
    }));

    // 5. Group Contents
    const sectionsWithContents = sections.map(section => {
      return {
        sectionId: String(section.section_id),
        title: section.title,
        description: section.description,
        orderIndex: section.order_index,
        contents: adaptiveContents.filter(c => c.section_id === section.section_id)
      };
    });

    // 6. Return
    return {
      courseId: String(course.course_id),
      title: course.title,
      description: course.description,
      thumbnailUrl: thumbnailUrlWithSas,
      progress: access.registration?.progress ?? 0,
      sections: sectionsWithContents
    };
  }

  async exportAdminCourseReport(courseId: string): Promise<Buffer> {
    const course = await this.courseRepo.findOne({
      where: { course_id: courseId },
      relations: ["owner"],
    });
    if (!course) throw new NotFoundException("Không tìm thấy khóa học");

    const overview = await this.resultRepo
      .createQueryBuilder("qr")
      .leftJoin("qr.questionBank", "qb")
      .leftJoin("qb.content", "content")
      .leftJoin("content.course", "course")
      .select([
        "COUNT(DISTINCT qr.student_id)::int AS total_students",
        "COUNT(qr.result_id)::int AS total_attempts",
        "AVG(qr.score)::float AS avg_score",
        "SUM(CASE WHEN qr.is_passed THEN 1 ELSE 0 END)::int AS total_passed",
      ])
      .where("course.course_id = :courseId", { courseId })
      .getRawOne();

    const quizzes = await this.quizRepository
      .createQueryBuilder("qb")
      .leftJoin("qb.content", "content")
      .leftJoin("content.course", "course")
      .where("course.course_id = :courseId", { courseId })
      .getMany();

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
      .groupBy("qb.question_bank_id")
      .addGroupBy("qb.quiz_title")
      .getRawMany();

    const quizMap = new Map(quizStats.map((q) => [q.quiz_id, q]));
    const fullQuizStats = quizzes.map((quiz) => ({
      quiz_id: quiz.question_bank_id,
      quiz_title: quiz.quiz_title,
      total_results:
        Number(quizMap.get(quiz.question_bank_id)?.total_results) || 0,
      avg_score:
        Number(quizMap.get(quiz.question_bank_id)?.avg_score?.toFixed(2)) || 0,
      total_passed:
        Number(quizMap.get(quiz.question_bank_id)?.total_passed) || 0,
    }));

    const studentStats = await this.resultRepo
      .createQueryBuilder("qr")
      .leftJoin("qr.student", "student")
      .leftJoin("qr.questionBank", "qb")
      .leftJoin("qb.content", "content")
      .leftJoin("content.course", "course")
      .select([
        "student.id AS student_id",
        "student.username AS student_name",
        "COUNT(qr.result_id)::int AS attempts",
        "AVG(qr.score)::float AS avg_score",
        "SUM(CASE WHEN qr.is_passed THEN 1 ELSE 0 END)::int AS total_passed",
      ])
      .where("course.course_id = :courseId", { courseId })
      .groupBy("student.id")
      .addGroupBy("student.username")
      .getRawMany();

    const workbook = new ExcelJS.Workbook();
    const summarySheet = workbook.addWorksheet("Tổng quan");
    const quizSheet = workbook.addWorksheet("Bài kiểm tra");
    const studentSheet = workbook.addWorksheet("Học viên");

    summarySheet.addRows([
      ["Tên khóa học", course.title],
      ["Người tạo", course.owner?.username || "—"],
      ["Tổng số học viên", Number(overview?.total_students) || 0],
      ["Tổng số lượt làm bài", Number(overview?.total_attempts) || 0],
      ["Số bài kiểm tra", quizzes.length],
      ["Điểm trung bình", Number(overview?.avg_score?.toFixed(2)) || 0],
      ["Tổng số pass", Number(overview?.total_passed) || 0],
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
      ["Ngày tạo khóa", course.created_at.toLocaleString()],
      ["Cập nhật lần cuối", course.updated_at.toLocaleString()],
    ]);

    quizSheet.columns = [
      { header: "ID Quiz", key: "quiz_id", width: 15 },
      { header: "Tên bài kiểm tra", key: "quiz_title", width: 40 },
      { header: "Số lượt làm", key: "total_results", width: 15 },
      { header: "Điểm trung bình", key: "avg_score", width: 15 },
      { header: "Số Pass", key: "total_passed", width: 15 },
      { header: "Tỷ lệ Pass (%)", key: "pass_rate", width: 15 },
    ];

    fullQuizStats.forEach((q) => {
      quizSheet.addRow({
        quiz_id: q.quiz_id,
        quiz_title: q.quiz_title,
        total_results: q.total_results,
        avg_score: q.avg_score,
        total_passed: q.total_passed,
        pass_rate:
          q.total_results > 0
            ? `${Math.round((q.total_passed / q.total_results) * 100)}%`
            : "0%",
      });
    });

    studentSheet.columns = [
      { header: "ID Học viên", key: "student_id", width: 15 },
      { header: "Tên học viên", key: "student_name", width: 30 },
      { header: "Số lượt làm", key: "attempts", width: 15 },
      { header: "Điểm trung bình", key: "avg_score", width: 15 },
      { header: "Số Pass", key: "total_passed", width: 15 },
    ];

    studentSheet.addRows(
      studentStats.map((s) => ({
        student_id: s.student_id,
        student_name: s.student_name,
        attempts: Number(s.attempts) || 0,
        avg_score: Number(s.avg_score?.toFixed(2)) || 0,
        total_passed: Number(s.total_passed) || 0,
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

  async getPurchasedCourses(userId: string) {
    if (!userId) {
      throw new ForbiddenException("Thiếu thông tin người dùng");
    }

    const registrations = await this.registrationRepo.find({
      where: { user_id: userId, payment_status: 'PAID' },
      relations: ['course'],
      order: { purchase_date: 'DESC' },
    });

    const coursesWithSas = await Promise.all(
      registrations.map(async (reg) => {
        const course = reg.course;
        let thumbnailUrlWithSas: string | null = course.thumbnail_url;
        if (course.thumbnail_url) {
          try {
            thumbnailUrlWithSas = await this.storageService.generateSasUrlFromUrl(
              course.thumbnail_url,
              'image',
              1
            );
          } catch (error) {
            console.error('Failed to generate SAS token for thumbnail:', error);
          }
        }

        return {
          registrationId: reg.registration_id,
          courseId: String(course.course_id),
          title: course.title,
          description: course.description,
          price: course.price,
          currency: course.currency,
          category: course.category,
          courseDuration: course.course_duration,
          teacher: course.teacher,
          courseDescription: course.course_description,
          thumbnailUrl: thumbnailUrlWithSas,
          progress: reg.progress,
          purchaseDate: reg.purchase_date,
          amountPaid: reg.amount_paid,
        };
      })
    );

    return coursesWithSas;
  }

  async getCoursesByType(type: string, limit: number = 20) {
    let courses: Course[] = [];

    switch (type) {
      case 'all':
        courses = await this.courseRepo.find({
          where: {
            status: CourseStatus.APPROVED,
            visibility: CourseVisibility.PUBLIC,
          },
          order: { created_at: 'DESC' },
          take: limit,
        });
        break;

      case 'new':
        courses = await this.courseRepo.find({
          where: {
            status: CourseStatus.APPROVED,
            visibility: CourseVisibility.PUBLIC,
          },
          order: { created_at: 'DESC' },
          take: limit,
        });
        break;

      case 'trend':
        const trending = await this.reviewRepo
          .createQueryBuilder('review')
          .select('review.course_id', 'course_id')
          .addSelect('AVG(review.rating)', 'avg_rating')
          .addSelect('COUNT(review.review_id)', 'review_count')
          .innerJoin('review.course', 'course')
          .where('course.status = :status', { status: CourseStatus.APPROVED })
          .andWhere('course.visibility = :visibility', { visibility: CourseVisibility.PUBLIC })
          .groupBy('review.course_id')
          .orderBy('avg_rating', 'DESC')
          .addOrderBy('review_count', 'DESC')
          .limit(limit)
          .getRawMany();

        if (trending.length > 0) {
          const courseIds = trending.map(t => t.course_id);
          const coursesMap = await this.courseRepo
            .createQueryBuilder('course')
            .whereInIds(courseIds)
            .getMany();

          const courseMapById = new Map(coursesMap.map(c => [c.course_id, c]));
          courses = trending
            .map(t => courseMapById.get(t.course_id))
            .filter((c): c is Course => !!c);
        }
        break;

      default:
        throw new BadRequestException('Invalid type. Use: all, new, or trend');
    }

    const coursesWithSas = await Promise.all(
      courses.map(async (c) => {
        let thumbnailUrlWithSas: string | null = c.thumbnail_url;
        if (c.thumbnail_url) {
          try {
            thumbnailUrlWithSas = await this.storageService.generateSasUrlFromUrl(
              c.thumbnail_url,
              'image',
              1
            );
          } catch (error) {
            console.error('Failed to generate SAS token for thumbnail:', error);
          }
        }

        const avgRating = await this.reviewRepo
          .createQueryBuilder('review')
          .select('COALESCE(AVG(review.rating), 0)', 'avg')
          .where('review.course_id = :courseId', { courseId: c.course_id })
          .getRawOne();

        return {
          courseId: String(c.course_id),
          title: c.title,
          description: c.description,
          price: c.price,
          currency: c.currency,
          category: c.category,
          status: c.status,
          visibility: c.visibility,
          courseDuration: c.course_duration,
          teacher: c.teacher,
          discountAmount: c.discount_amount,
          courseDescription: c.course_description,
          thumbnailUrl: thumbnailUrlWithSas,
          isPaid: c.is_paid,
          mobileIapEnabled: c.mobile_iap_enabled,
          rating: parseFloat(avgRating?.avg ?? '0') || 0,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
        };
      })
    );

    return coursesWithSas;
  }
  async countPublicApprovedCourses(): Promise<number> {
    return this.courseRepo.count({
      where: {
        status: CourseStatus.APPROVED,
        visibility: CourseVisibility.PUBLIC,
      },
    });
  }

  async getCategorySummary() {
    const query = this.courseRepo
      .createQueryBuilder('course')
      .select('course.category', 'category')
      .addSelect('COUNT(DISTINCT course.course_id)', 'totalCourses')
      .leftJoin('course.registrations', 'reg', 'reg.payment_status = :paidStatus', { paidStatus: 'PAID' })
      .addSelect('COUNT(DISTINCT reg.user_id)', 'totalStudents')
      .addSelect(subQuery => {
        return subQuery
          .select('COALESCE(ROUND(AVG(review.rating), 1), 0)')
          .from(CourseReview, 'review')
          .innerJoin('courses', 'c_sub', 'c_sub.course_id = review.course_id')
          .where('c_sub.category = course.category');
      }, 'avgRating')
      .addSelect(subQuery => {
        return subQuery
          .select('COUNT(file.file_id)', 'videoCount')
          .from(ContentFile, 'file')
          .innerJoin('file.content', 'content')
          .innerJoin('content.section', 'section')
          .innerJoin('section.course', 'c_video')
          .where('c_video.category = course.category')
          .andWhere('c_video.status = :status', { status: CourseStatus.APPROVED })

      }, 'totalVideos')
      .where('course.status = :status', { status: CourseStatus.APPROVED })
      .groupBy('course.category')
      .orderBy('COUNT(DISTINCT reg.user_id)', 'DESC');

    const rawData = await query.getRawMany();

    return {
      data: rawData.map(item => ({
        category: item.category,
        totalCourses: Number(item.totalCourses || 0),
        totalStudents: Number(item.totalStudents || 0),
        avgRating: item.avgRating ? parseFloat(item.avgRating) : 0,
        totalVideos: Number(item.totalVideos || 0),
      })),
    };
  }
}
