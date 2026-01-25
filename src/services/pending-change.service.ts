import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  forwardRef,
  Inject
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PendingChange } from '../schema/entities/pending-change.entity';
import { Course } from '../schema/entities/course.entity';
import { CourseSection } from '../schema/entities/course-section.entity';
import { ContentFile, FileType } from '../schema/entities/content-file.entity';
import { CreateContentFileDto } from '../schema/dtos/create-content-file.dto';
import { AccumulatedChangeData, SectionToAdd, LessonToAdd } from '../schema/dtos/accumulated-change-data.interface';
import { CreateSectionDto } from '../schema/dtos/create-section.dto';
import { ContentService } from './content.service';
import { CreateContentDto } from '../schema/dtos/create-content.dto';
import { UpdateContentDto } from 'src/schema/dtos/update-content.dto';
import { SectionService } from './section.service';
import { UpdateSectionDto } from 'src/schema/dtos/update-section.dto';
import { UserService } from './user.service';
import { CourseService } from './course.service';
import { courseApprovedTemplate, courseRejectedTemplate } from "../public/email/course-status.email";
import { EmailService } from './auth-email.service';
import { SystemRole } from '../schema/entities/role.entity';
import { PreModerationEngine } from './pre-moderation-engine';

@Injectable()
export class PendingChangeService {
    findById(pendingChangeId: string, arg1: { relations: string[]; }) {
        throw new Error('Method not implemented.');
    }
  constructor(
    @InjectRepository(PendingChange)
    private readonly pendingChangeRepo: Repository<PendingChange>,

    @InjectRepository(CourseSection)
    private readonly sectionRepo: Repository<CourseSection>,

    @InjectRepository(Course)                 
    private courseRepo: Repository<Course>,

    @Inject(forwardRef(() => CourseService))
    private readonly courseService: CourseService, 

    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,

    @Inject(forwardRef(() => ContentService))
    private readonly contentService: ContentService,

    @Inject(forwardRef(() => SectionService))
    private readonly sectionService: SectionService,

    private readonly emailService: EmailService,

  ) {}
  private generateTempId(prefix: string = 'temp'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  async findOne(id: string, options?: any): Promise<PendingChange | null> {
    return await this.pendingChangeRepo.findOne({
      where: { id },
      ...options,
    });
  }
  async createPendingChange(
    userId: string,
    courseId: string,
    changeData: any,
  ): Promise<PendingChange> {
    const course = await this.courseService.getDetail(courseId);
    if (!course) throw new NotFoundException('Course not found');
    if (course.userId !== userId) throw new ForbiddenException('Không có quyền');

    // Tìm draft hiện có của teacher + course này
    let pending = await this.pendingChangeRepo.findOne({
      where: {
        course: { course_id: courseId },
        submittedBy: { id: userId },
        status: 'draft',
      },
    });

    let accumulated: AccumulatedChangeData = pending?.changeData || {};

    // === XỬ LÝ THEO TYPE (có type) ===
    if (changeData.type) {
      switch (changeData.type) {
        case 'ADD_SECTION': {
          accumulated.addSections = accumulated.addSections || [];
          const newSection = changeData.data;
          newSection.temp_id = this.generateTempId('sec');
          // 1. Kiểm tra trùng trong pending (draft hiện tại)
          if (accumulated.addSections.some(s => s.title === newSection.title)) {
            throw new BadRequestException(
              `Section "${newSection.title}" đã tồn tại trong thay đổi chờ duyệt`,
            );
          }

          // 2. Kiểm tra trùng trong DB (section đã được duyệt trước đó)
          const existsInDb = await this.sectionRepo.findOne({
            where: { course_id: course.courseId, title: newSection.title },
          });
          if (existsInDb) {
            throw new BadRequestException(
              `Section "${newSection.title}" đã tồn tại trong khóa học`,
            );
          }

          accumulated.addSections.push(newSection);
          break;
        }

        case 'ADD_CONTENT': {
          accumulated.addContents = accumulated.addContents || [];
          const newContent = changeData.data;
          newContent.temp_id = this.generateTempId('con');
          // Chỉ cho phép thêm nếu chưa có trong pending (tránh trùng title trong cùng section)
          if (
            accumulated.addContents.some(
              c =>
                c.section_id === newContent.section_id &&
                c.title === newContent.title,
            )
          ) {
            throw new BadRequestException(
              `Bài học "${newContent.title}" đã tồn tại trong thay đổi chờ duyệt của chương này`,
            );
          }

          accumulated.addContents.push(newContent);
          break;
        }

        case 'UPDATE_SECTION':
          accumulated.updateSections = accumulated.updateSections || {};
          accumulated.updateSections[changeData.target_id] = changeData.data;
          break;

        case 'UPDATE_CONTENT':
          accumulated.updateContents = accumulated.updateContents || {};
          accumulated.updateContents[changeData.target_id] = changeData.data;
          break;

        case 'BULK_ADD_SECTIONS': {
          accumulated.bulkAddSections = accumulated.bulkAddSections || [];
          const sectionsToAdd: SectionToAdd[] = changeData.data;

          for (const sec of sectionsToAdd) {
            // Kiểm tra trùng title trong pending
            const alreadyInPending =
              accumulated.bulkAddSections.some(s => s.title === sec.title) ||
              accumulated.addSections?.some(s => s.title === sec.title);

            if (alreadyInPending) {
              throw new BadRequestException(
                `Section "${sec.title}" đã tồn tại trong thay đổi chờ duyệt`,
              );
            }

            // Kiểm tra trùng trong DB
            const existsInDb = await this.sectionRepo.findOne({
              where: { course_id: course.courseId, title: sec.title },
            });
            if (existsInDb) {
              throw new BadRequestException(
                `Section "${sec.title}" đã tồn tại trong khóa học`,
              );
            }

            // SINH temp_id CHO SECTION
            const sectionTempId = this.generateTempId('sec');

            // XỬ LÝ LESSONS TRONG SECTION
            const lessonsWithTempId = (sec.lessons || []).map((lesson: any) => ({
              ...lesson,
              temp_id: this.generateTempId('con'),        
              section_temp_id: sectionTempId,              
            }));

            accumulated.bulkAddSections.push({
              ...sec,
              temp_id: sectionTempId,
              lessons: lessonsWithTempId,
            });
          }
          break;
        }

        default:
          throw new BadRequestException(`Unknown change type: ${changeData.type}`);
      }
    }
    // === XỬ LÝ BULK_ADD_SECTIONS ===
    else if (changeData.sections && Array.isArray(changeData.sections)) {
      accumulated.bulkAddSections = accumulated.bulkAddSections || [];

      for (const sec of changeData.sections) {
        const normalized: SectionToAdd = {
          title: sec.title,
          description: sec.description || '',
          is_preview: sec.is_preview || 'N',
          order_index: sec.order_index,
          lessons: Array.isArray(sec.lessons) ? sec.lessons : [], 
        };

        // Kiểm tra trùng trong pending
        const alreadyInPending =
          accumulated.bulkAddSections.some(s => s.title === normalized.title) ||
          accumulated.addSections?.some(s => s.title === normalized.title);

        if (alreadyInPending) {
          throw new BadRequestException(
            `Section "${normalized.title}" đã tồn tại trong thay đổi chờ duyệt`,
          );
        }

        // Kiểm tra trùng trong DB
        const existsInDb = await this.sectionRepo.findOne({
          where: { course_id: course.courseId, title: normalized.title },
        });
        if (existsInDb) {
          throw new BadRequestException(
            `Section "${normalized.title}" đã tồn tại trong khóa học`,
          );
        }

        // SINH temp_id CHO SECTION
        const sectionTempId = this.generateTempId('sec');

        const lessonsWithTempId = (normalized.lessons ?? []).map((lesson: any) => ({
          ...lesson,
          temp_id: this.generateTempId('con'),
          section_temp_id: sectionTempId,
        }));

        // ĐẨY VÀO DRAFT
        accumulated.bulkAddSections.push({
          ...normalized,
          temp_id: sectionTempId,
          lessons: lessonsWithTempId,
        });
      }
  }
    // === Format không hợp lệ ===
    else {
      throw new BadRequestException('Invalid changeData format');
    }

    // === Lưu draft (cập nhật hoặc tạo mới) ===
    if (pending) {
      pending.changeData = accumulated;
      pending.updatedAt = new Date();
      return await this.pendingChangeRepo.save(pending);
    }

    // Tạo mới draft
    const user = await this.userService.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const newPending = this.pendingChangeRepo.create({
      course: { course_id: courseId } as Course,
      submittedBy: user,
      changeData: accumulated,
      status: 'draft',
    });

    return await this.pendingChangeRepo.save(newPending);
  }

async submitPendingChange(
  pendingChangeId: string,
  teacherId: string,
): Promise<PendingChange> {
  const pending = await this.pendingChangeRepo.findOne({
    where: { id: pendingChangeId, submittedBy: { id: teacherId } },
    relations: ['course', 'submittedBy'],
  });

  if (!pending) throw new NotFoundException('Pending change not found');
  if (pending.status !== 'draft') {
    throw new BadRequestException(`Cannot submit: status is ${pending.status}`);
  }

  // Kiểm tra course đã có pending change chưa
  const existingPending = await this.pendingChangeRepo.findOne({
    where: {
      course: { course_id: pending.course.course_id },
      status: 'pending',
    },
  });
  if (existingPending) {
    throw new BadRequestException(
      'This course already has a change awaiting review. ' +
      'Please wait for admin to approve or reject before submitting new changes.'
    );
  }

  // Kiểm tra có thay đổi
  const changeData = pending.changeData as AccumulatedChangeData;
  const hasChanges =
    (changeData.addSections?.length || 0) +
    (changeData.addContents?.length || 0) +
    Object.keys(changeData.updateSections || {}).length +
    Object.keys(changeData.updateContents || {}).length +
    (changeData.bulkAddSections?.length || 0);

  if (hasChanges === 0) {
    throw new BadRequestException('No changes to submit');
  }

  // Validate nội dung
  try {
    await PreModerationEngine.validatePendingChange(
      changeData,
      teacherId,
      this.pendingChangeRepo,
      this.courseRepo,
    );
  } catch (error) {
    if (error instanceof BadRequestException) {
      throw error;
    }
    throw error;
  }

  const teacher = pending.submittedBy;

  // Tính risk score cho pending change
  const riskScore = await PreModerationEngine.calculateRiskScore(pending, teacher, this.userService);
  pending.riskScore = riskScore;
  const trustScore = teacher?.trustScore ?? 0;

  console.log(`Teacher ${teacher.id} - trustScore: ${teacher.trustScore}, riskScore: ${riskScore}`);

  // Quy tắc auto approve theo trustScore và riskScore
  let autoApprove = false;
  if (trustScore > 80 && riskScore < 60) autoApprove = true;
  else if (trustScore >= 50 && trustScore <= 80 && riskScore < 30) autoApprove = true;

  pending.status = 'pending';
  pending.updatedAt = new Date();
  await this.pendingChangeRepo.save(pending);

  if (autoApprove) {
    await this.approvePendingChange(pendingChangeId, 'system', true);
    return await this.pendingChangeRepo.findOneOrFail({
      where: { id: pendingChangeId },
      relations: ['course', 'submittedBy'],
    });
  }

  return pending;
}

  // ADMIN: DUYỆT TOÀN BỘ THAY ĐỔI
  async approvePendingChange(id: string, adminId: string, isSystem = false): Promise<PendingChange> {
    const pending = await this.pendingChangeRepo.findOne({
        where: { id },
        relations: ['course', 'submittedBy'],
      });

    if (!pending) throw new NotFoundException('Pending change not found');
    if (pending.status !== 'pending') {
        throw new ForbiddenException('Only submitted changes (status: pending) can be processed');
      }

    const course = pending.course;
    const change: AccumulatedChangeData = pending.changeData as AccumulatedChangeData;

    try {
      // 1. ADD SECTIONS
      if (change.addSections?.length) {
        for (const sec of change.addSections) {
          const createDto: CreateSectionDto = {
            title: sec.title,
            description: sec.description || '',
            course_id: course.course_id,
            order_index: sec.order_index ?? (await this.getNextSectionOrder(course.course_id)),
            is_preview: sec.is_preview || 'N',
          };

          if (!pending.course.user_id) {
            throw new ForbiddenException('Invalid course owner');
          }

          await this.createSectionFromDto(createDto, pending.course.user_id);
        }
      }

      // 2. ADD CONTENTS
      if (change.addContents?.length) {
        for (const content of change.addContents) {
          await this.createContentFromData(course, content);
        }
      }

      // 3. UPDATE SECTIONS
      if (change.updateSections) {
        for (const [targetId, data] of Object.entries(change.updateSections)) {
          await this.updateSectionFromData(targetId, data, course);
        }
      }

      // 4. UPDATE CONTENTS
      if (change.updateContents) {
        for (const [targetId, data] of Object.entries(change.updateContents)) {
          await this.updateContentFromData(targetId, data, course);
        }
      }

      // 5. BULK ADD SECTIONS + LESSONS
      if (change.bulkAddSections?.length) {
        await this.handleBulkAddSections(course, change.bulkAddSections);
      }
    if (!isSystem) {
        await this.userService.updateTrustScore(pending.submittedBy.id, 5);
    }

    } catch (error) {
      console.error('Approve failed:', error);
      throw error;
    }

    pending.status = 'approved';
    pending.adminComment = `Approved by admin ID: ${adminId}`;
    await this.emailService.sendPendingChangeApprovedEmail(
      pending.submittedBy.email,
      course.title,
      'Các thay đổi đã được áp dụng thành công!'
    );
    return await this.pendingChangeRepo.save(pending);
  }

  private async createSectionFromDto(dto: CreateSectionDto, ownerId: string) {
    await this.sectionService.create(dto, ownerId, true);
  }

  private async createContentFromData(course: Course, data: LessonToAdd) {
    // Chuẩn hóa thành CreateContentDto
    const createDto: CreateContentDto = {
      title: data.title,
      description: data.description || '',
      is_preview: data.is_preview || 'N',
      course_id: course.course_id,
      section_id: data.section_id || '',
      files: [],
    };

    // Tạo file từ data.content
    if (data.content) {
      createDto.files!.push({
        title: data.title,
        filename: `${Date.now()}_${data.title.replace(/\s+/g, '_')}`,
        url: data.content,
        file_type: this.mapFileType(data.type || 'video'),
        order_index: 1,
        is_preview: data.is_preview || 'N',
      });
    }

    // Thêm file từ data.files
    if (data.files?.length) {
      data.files.forEach((f, i) => {
        const title = f.title || data.title;
        createDto.files!.push({
          title,
          filename: f.filename || `${Date.now()}_${title.replace(/\s+/g, '_')}`,
          url: f.url,
          file_type: f.file_type,
          file_size: f.file_size ?? 0,
          mime_type: f.mime_type ?? '',
          order_index: f.order_index ?? i + (data.content ? 2 : 1),
          is_preview: f.is_preview || 'N',
        });
      });
    }

    await this.contentService.create(createDto, course.user_id, true);
  }
  private async updateSectionFromData(targetId: string, data: any, course: Course) {
    const updateDto: UpdateSectionDto = {
      title: data.title,
      description: data.description,
      order_index: data.order_index,
      is_active: data.is_active,
    };

    await this.sectionService.update(targetId, updateDto, course.user_id, true);
  }
  private async updateContentFromData(targetId: string, data: any, course: Course) {
    const updateDto: UpdateContentDto = {
      title: data.title,
      description: data.description,
      section_id: data.section_id,
      files: data.files,
    };

    await this.contentService.update(targetId, updateDto, course.user_id, true);
  }

  async deletePendingChange(pendingChangeId: string, userId: string): Promise<void> {
    const pending = await this.pendingChangeRepo.findOne({
      where: { id: pendingChangeId },
      relations: ['submittedBy'],
    });

    if (!pending) throw new NotFoundException('Pending change not found');

    if (pending.submittedBy.id !== userId) {
      throw new ForbiddenException('Bạn không có quyền xóa thay đổi này');
    }

    if (pending.status === 'pending' || pending.status === 'approved') {
      throw new BadRequestException(
        `Không thể xóa pending change đang ở trạng thái "${pending.status}"`,
      );
    }

    await this.pendingChangeRepo.remove(pending);
  }

private async handleBulkAddSections(course: Course, sectionsData: SectionToAdd[]) {
  for (const secData of sectionsData) {
    const createSectionDto: CreateSectionDto = {
      title: secData.title,
      description: secData.description || '',
      is_preview: secData.is_preview || 'N',
      course_id: course.course_id,
    };

    if (secData.order_index != null) {
      createSectionDto.order_index = secData.order_index;
    }

    const result = await this.sectionService.create(createSectionDto, course.user_id, true);

    if (!result || 'changeData' in (result as any)) {
      continue; 
    }

    const savedSection = result as CourseSection;

    if (secData.lessons?.length) {
      for (const lesson of secData.lessons) {
        const createContentDto: CreateContentDto = {
          title: lesson.title,
          description: lesson.description || '',
          is_preview: lesson.is_preview || 'N',
          course_id: course.course_id,
          section_id: savedSection.section_id,
          files: [],
        };

    if (lesson.content) {
      createContentDto.files!.push({
        title: lesson.title,
        filename: `${Date.now()}_${lesson.title.replace(/\s+/g, '_')}`,
        url: lesson.content,
        file_type: this.mapFileType(lesson.type || 'video'),
        order_index: 1,
        is_preview: lesson.is_preview || 'N',
      } as CreateContentFileDto);
    }

    if (lesson.files?.length) {
      lesson.files.forEach((f, i) => {
        const title = f.title || lesson.title;
        createContentDto.files!.push({
          title,
          filename: f.filename || `${Date.now()}_${title.replace(/\s+/g, '_')}`,
          url: f.url,
          file_type: f.file_type,
          file_size: f.file_size || 0,
          mime_type: f.mime_type || '',
          order_index: f.order_index || i + (lesson.content ? 2 : 1),
          is_preview: f.is_preview || 'N',
        } as CreateContentFileDto);
      });
    }
      await this.contentService.create(createContentDto, course.user_id, true);
    }
    }
  }
}

  private async getNextSectionOrder(courseId: string): Promise<number> {
    const result = await this.sectionRepo
      .createQueryBuilder('section')
      .select('COALESCE(MAX(section.order_index), 0) + 1', 'next')
      .where('section.course_id = :courseId', { courseId })
      .getRawOne();
    return result.next;
  }

  private mapFileType(type: string): FileType {
    const map: Record<string, FileType> = {
      video: FileType.VIDEO,
      pdf: FileType.PDF,
      image: FileType.IMAGE,
      audio: FileType.AUDIO,
      document: FileType.DOCUMENT,
      text: FileType.TEXT,
      quiz: FileType.QUIZ,
    };
    return map[type?.toLowerCase()] || FileType.DOCUMENT;
  }

  async getAllPendingChanges(): Promise<PendingChange[]> {
    return await this.pendingChangeRepo.find({
      where: {
        status: In(['pending', 'approved', 'rejected']),
      },
      relations: ['course', 'submittedBy'],
      order: { createdAt: 'DESC' },
    });
  }

  async getPendingChangesByUser(userId: string | null): Promise<PendingChange[]> {
    if (!userId) {
      throw new ForbiddenException("Thiếu thông tin người dùng");
    }

    return await this.pendingChangeRepo.find({
      where: {
        submittedBy: { id: userId } 
      },
      relations: ['course', 'submittedBy'], 
      order: { createdAt: 'DESC' },
    });
  }

  async rejectPendingChange(id: string, adminId: string, reason: string): Promise<PendingChange> {
    const pending = await this.pendingChangeRepo.findOne({
      where: { id },
      relations: ['course', 'submittedBy'],
    });
    if (!pending) throw new NotFoundException('Pending change not found');
    if (pending.status !== 'pending') {
        throw new ForbiddenException('Only submitted changes (status: pending) can be processed');
      }

    pending.status = 'rejected';
    pending.adminComment = `Rejected by admin ID: ${adminId} - Reason: ${reason}`;
    await this.userService.decreaseTrustScore(pending.submittedBy.id, 5);
    await this.emailService.sendPendingChangeRejectedEmail(
      pending.submittedBy.email,
      pending.course.title,
      reason
    );
    return await this.pendingChangeRepo.save(pending);
  }


  private async transformChangeData(pc: PendingChange, courseId: string): Promise<PendingChange> {
    const cd = pc.changeData || {};
    const sectionMap = new Map<string, any>();
    const sections: any[] = [];

    const sectionTitleCache = new Map<string, string>();
    const getRealSectionTitle = async (sectionId: string): Promise<string> => {
      if (sectionTitleCache.has(sectionId)) return sectionTitleCache.get(sectionId)!;
      try {
        const section = await this.sectionRepo.findOne({
          where: { section_id: sectionId, course: { course_id: courseId } },
          select: ['title'],
        });
        const title = section?.title?.trim() || `Chương #${sectionId}`;
        sectionTitleCache.set(sectionId, title);
        return title;
      } catch {
        const fallback = `Chương #${sectionId}`;
        sectionTitleCache.set(sectionId, fallback);
        return fallback;
      }
    };

    // 1. addSections + bulkAddSections
    [...(cd.addSections || []), ...(cd.bulkAddSections || [])].forEach((sec: any) => {
      const tempId = sec.temp_id;
      if (!tempId) return;
      const obj = {
        type: 'add' as const,
        temp_id: tempId,
        title: sec.title || '(Chưa có tiêu đề)',
        description: sec.description || '',
        order_index: sec.order_index ?? 0,
        contents: [] as any[],
      };
      sectionMap.set(tempId, obj);
      sections.push(obj);
    });

    // 2. addContents
    for (const content of (cd.addContents || [])) {
      let target: any = null;

      if (content.section_temp_id && sectionMap.has(content.section_temp_id)) {
        target = sectionMap.get(content.section_temp_id);
      } else if (content.section_id) {
        const key = `existing-${content.section_id}`;
        if (!sectionMap.has(key)) {
          const realTitle = await getRealSectionTitle(content.section_id);
          const fake = {
            type: 'update' as const,
            section_id: content.section_id,
            title: `${realTitle} (đang thêm bài mới)`,
            description: 'Bài học mới được thêm vào chương cũ',
            order_index: 1000,
            contents: [] as any[],
          };
          sectionMap.set(key, fake);
          sections.push(fake);
        }
        target = sectionMap.get(key);
      }

      const contentObj = {
        type: 'add' as const,
        temp_id: content.temp_id || `temp-${Date.now()}`,
        title: content.title || '(Chưa có tiêu đề)',
        description: content.description || '',
        files: content.files || [],
        is_preview: content.is_preview || 'N',
        order_index: content.order_index ?? 0,
      };

      if (target) {
        target.contents.push(contentObj);
      } else {
        if (!sectionMap.has('orphan')) {
          const orphan = { type: 'update' as const, title: 'Bài học lẻ', order_index: 9999, contents: [] };
          sectionMap.set('orphan', orphan);
          sections.push(orphan);
        }
        sectionMap.get('orphan').contents.push(contentObj);
      }
    }

    // 3. updateContents (tương tự)
    if (cd.updateContents) {
      for (const [key, value] of Object.entries(cd.updateContents)) {
        const val = value as any;
        let target: any = null;

        if (val.section_id) {
          const key = `existing-${val.section_id}`;
          if (!sectionMap.has(key)) {
            const realTitle = await getRealSectionTitle(val.section_id);
            const fake = {
              type: 'update' as const,
              section_id: val.section_id,
              title: `${realTitle} (đang sửa bài)`,
              order_index: 1000,
              contents: [] as any[],
            };
            sectionMap.set(key, fake);
            sections.push(fake);
          }
          target = sectionMap.get(key);
        } else {
          if (!sectionMap.has('orphan')) {
            const orphan = { type: 'update' as const, title: 'Bài học lẻ', order_index: 9999, contents: [] };
            sectionMap.set('orphan', orphan);
            sections.push(orphan);
          }
          target = sectionMap.get('orphan');
        }

        target.contents.push({
          type: 'update' as const,
          content_id: val.content_id || key,
          title: val.title || key,
          description: val.description || '',
          is_preview: val.is_preview || 'N',
        });
      }
    }

    sections.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

    return {
      ...pc,
      changeData: { sections },
    };
  }
  async getPendingChangeDetail(id: string, courseId?: string): Promise<PendingChange> {
    const pending = await this.pendingChangeRepo.findOne({
      where: { id },
      relations: ['course', 'submittedBy'],
    });

    if (!pending) {
      throw new NotFoundException('Pending change not found');
    }

    if (pending.changeData) {
      const transformed = await this.transformChangeData(pending, courseId || pending.course.course_id);
      pending.changeData = transformed.changeData;
    }

    return pending;
  }

  async getPendingChangesByCourseId(
    courseId: string,
    userId: string,
    role: SystemRole,
    options?: {
      includeDraft?: boolean;
      page?: number;
      limit?: number;
    }
  ): Promise<{ data: PendingChange[]; total: number }> {
    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const skip = (page - 1) * limit;

    const course = await this.courseService.getDetail(courseId);
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    // Kiểm quyền
    if (role !== SystemRole.ADMIN && course.userId !== userId) {
      return { data: [], total: 0 };
    }

    const where: any = { course: { course_id: courseId } };
    if (role === SystemRole.ADMIN && options?.includeDraft === false) {
      where.status = In(['pending', 'approved', 'rejected']);
    }

    const [pendingChanges, total] = await this.pendingChangeRepo.findAndCount({
      where,
      relations: ['course', 'submittedBy'],
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    const sectionTitleCache = new Map<string, string>();
    const getRealSectionTitle = async (sectionId: string): Promise<string> => {
      if (sectionTitleCache.has(sectionId)) {
        return sectionTitleCache.get(sectionId)!;
      }
      try {
        const section = await this.sectionRepo.findOne({
          where: { section_id: sectionId, course: { course_id: courseId } },
          select: ['title'],
        });
        const title = section?.title?.trim() || `Chương #${sectionId}`;
        sectionTitleCache.set(sectionId, title);
        return title;
      } catch {
        const fallback = `Chương #${sectionId}`;
        sectionTitleCache.set(sectionId, fallback);
        return fallback;
      }
    };

    // Transform từng pending change
    const transformedData = await Promise.all(
      pendingChanges.map(async (pc) => {
        const cd = pc.changeData || {};
        const sectionMap = new Map<string, any>();
        const sections: any[] = [];

        // 1. Thêm section mới
        [...(cd.addSections || []), ...(cd.bulkAddSections || [])].forEach((sec: any) => {
          const tempId = sec.temp_id;
          if (!tempId) return;

          const sectionObj = {
            type: 'add' as const,
            temp_id: tempId,
            title: sec.title || '(Chưa có tiêu đề)',
            description: sec.description || '',
            order_index: sec.order_index ?? 0,
            contents: [] as any[],
          };
          sectionMap.set(tempId, sectionObj);
          sections.push(sectionObj);
        });

        // 2. Cập nhật section cũ
        if (cd.updateSections && typeof cd.updateSections === 'object') {
          Object.entries(cd.updateSections).forEach(([key, value]: [string, any]) => {
            const sectionKey = `update-${key}`;
            const sectionObj = {
              type: 'update' as const,
              section_id: value.section_id || null,
              title: value.title || key,
              description: value.description || '',
              order_index: value.order_index ?? 999,
              contents: [] as any[],
            };
            sectionMap.set(sectionKey, sectionObj);
            sections.push(sectionObj);
          });
        }

        // 3. Thêm bài học mới (addContents)
        for (const content of (cd.addContents || [])) {
          let targetSection: any = null;

          if (content.section_temp_id && sectionMap.has(content.section_temp_id)) {
            targetSection = sectionMap.get(content.section_temp_id);
          } else if (content.section_id) {
            const fakeKey = `existing-sec-${content.section_id}`;
            if (!sectionMap.has(fakeKey)) {
              const realTitle = await getRealSectionTitle(content.section_id);
              const fakeSection = {
                type: 'update' as const,
                section_id: content.section_id,
                title: `${realTitle} (đang thêm bài mới)`,
                description: 'Bài học mới được thêm vào chương đã tồn tại',
                order_index: 1000,
                contents: [] as any[],
              };
              sectionMap.set(fakeKey, fakeSection);
              sections.push(fakeSection);
            }
            targetSection = sectionMap.get(fakeKey);
          }

          const contentObj = {
            type: 'add' as const,
            temp_id: content.temp_id || `temp-${Date.now()}`,
            title: content.title || '(Chưa có tiêu đề)',
            description: content.description || '',
            files: content.files || [],
            is_preview: content.is_preview || 'N',
            order_index: content.order_index ?? 0,
          };

          if (targetSection) {
            targetSection.contents.push(contentObj);
          } else {
            if (!sectionMap.has('orphan')) {
              const orphan = {
                type: 'update' as const,
                title: 'Bài học lẻ (không thuộc chương nào)',
                description: '',
                order_index: 9999,
                contents: [] as any[],
              };
              sectionMap.set('orphan', orphan);
              sections.push(orphan);
            }
            sectionMap.get('orphan').contents.push(contentObj);
          }
        }

        // 4. Cập nhật bài học cũ (updateContents)
        if (cd.updateContents && typeof cd.updateContents === 'object') {
          for (const [key, value] of Object.entries(cd.updateContents)) {
            const val = value as any;
            let targetSection: any = null;

            if (val.section_id) {
              const fakeKey = `existing-sec-${val.section_id}`;
              if (!sectionMap.has(fakeKey)) {
                const realTitle = await getRealSectionTitle(val.section_id);
                const fakeSection = {
                  type: 'update' as const,
                  section_id: val.section_id,
                  title: `${realTitle} (đang sửa bài)`,
                  description: '',
                  order_index: 1000,
                  contents: [] as any[],
                };
                sectionMap.set(fakeKey, fakeSection);
                sections.push(fakeSection);
              }
              targetSection = sectionMap.get(fakeKey);
            } else {
              if (!sectionMap.has('orphan')) {
                const orphan = {
                  type: 'update' as const,
                  title: 'Bài học lẻ (không thuộc chương nào)',
                  description: '',
                  order_index: 9999,
                  contents: [] as any[],
                };
                sectionMap.set('orphan', orphan);
                sections.push(orphan);
              }
              targetSection = sectionMap.get('orphan');
            }

            targetSection.contents.push({
              type: 'update' as const,
              content_id: val.content_id || key,
              title: val.title || key,
              description: val.description || '',
              is_preview: val.is_preview || 'N',
              order_index: val.order_index ?? 0,
            });
          }
        }

        // Sắp xếp theo thứ tự
        sections.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

        return {
          ...pc,
          changeData: { sections },
        };
      })
    );

    return { data: transformedData, total };
  }

  async resubmitRejectedChange(pendingChangeId: string, teacherId: string): Promise<PendingChange> {
    // 1. Lấy bản bị reject
    const rejected = await this.pendingChangeRepo.findOne({
      where: {
        id: pendingChangeId,
        submittedBy: { id: teacherId },
        status: 'rejected',
      },
      relations: ['course', 'submittedBy'],
    });

    if (!rejected) {
      throw new NotFoundException('Không tìm thấy bản bị từ chối hoặc bạn không có quyền');
    }

    const courseId = rejected.course.course_id;

    // 2. Tìm draft hiện có (nếu có)
    let draft = await this.pendingChangeRepo.findOne({
      where: {
        course: { course_id: courseId },
        submittedBy: { id: teacherId },
        status: 'draft',
      },
    });

    const rejectedChange: AccumulatedChangeData = rejected.changeData as AccumulatedChangeData;

    if (draft) {
      const currentChange: AccumulatedChangeData = draft.changeData as AccumulatedChangeData;

      // Gộp addSections
      const existingSectionTitles = new Set([
        ...(currentChange.addSections?.map(s => s.title) || []),
        ...(currentChange.bulkAddSections?.map(s => s.title) || []),
      ]);

      const newSectionsFromRejected = (rejectedChange.addSections || [])
        .filter(s => !existingSectionTitles.has(s.title));

      const newBulkSectionsFromRejected = (rejectedChange.bulkAddSections || [])
        .filter(s => !existingSectionTitles.has(s.title));

      // Gộp addContents 
      const existingContentKeys = new Set(
        (currentChange.addContents || []).map(c =>
          `${c.section_id || 'no-section'}___${c.title}`
        )
      );

      const newContentsFromRejected = (rejectedChange.addContents || [])
        .filter(c => !existingContentKeys.has(`${c.section_id || 'no-section'}___${c.title}`));

      // Gộp update 
      const mergedUpdates = {
        updateSections: { ...currentChange.updateSections, ...rejectedChange.updateSections },
        updateContents: { ...currentChange.updateContents, ...rejectedChange.updateContents },
      };

      // Cập nhật draft hiện có
      draft.changeData = {
        ...currentChange,
        addSections: [...(currentChange.addSections || []), ...newSectionsFromRejected],
        addContents: [...(currentChange.addContents || []), ...newContentsFromRejected],
        bulkAddSections: [...(currentChange.bulkAddSections || []), ...newBulkSectionsFromRejected],
        ...mergedUpdates,
      };

      // Ghi chú lịch sử
      draft.adminComment = `Merged from rejected change #${rejected.id}. Previous reason: ${rejected.adminComment || 'Không có lý do'}`;
      draft.updatedAt = new Date();

      return await this.pendingChangeRepo.save(draft);
    } else {
      const newDraft = this.pendingChangeRepo.create({
        course: rejected.course,
        submittedBy: rejected.submittedBy,
        changeData: rejected.changeData,
        status: 'draft',
        adminComment: `Created from rejected change #${rejected.id}. Previous reason: ${rejected.adminComment || 'Không có lý do'}`,
      });

      return await this.pendingChangeRepo.save(newDraft);
    }
  }

  private async getDraftOrFail(draftId: string, teacherId: string): Promise<PendingChange> {
    const draft = await this.pendingChangeRepo.findOne({
      where: {
        id: draftId,
        submittedBy: { id: teacherId },
        status: 'draft',
      },
      relations: ['course', 'submittedBy'],
    });

    if (!draft) {
      throw new NotFoundException('Không tìm thấy bản nháp hoặc bạn không có quyền chỉnh sửa');
    }

    return draft;
  }

  async updateSectionInDraft(
    draftId: string,
    teacherId: string,
    sectionTempId: string,
    updates: Partial<SectionToAdd>
  ) {
    const draft = await this.getDraftOrFail(draftId, teacherId);
    const data = draft.changeData as AccumulatedChangeData;

    let found = false;

    // Tìm trong addSections hoặc bulkAddSections
    for (const key of ['addSections', 'bulkAddSections'] as const) {
      if (data[key]) {
        const section = data[key]!.find(s => s.temp_id === sectionTempId);
        if (section) {
          Object.assign(section, updates);
          found = true;
        }
      }
    }

    if (!found) throw new NotFoundException('Không tìm thấy section');

    draft.updatedAt = new Date();
    return this.pendingChangeRepo.save(draft);
  }

  async updateLessonInDraft(
    draftId: string,
    teacherId: string,
    lessonTempId: string,
    updates: Partial<LessonToAdd>
  ) {
    const draft = await this.getDraftOrFail(draftId, teacherId);
    const data = draft.changeData as AccumulatedChangeData;

    let found = false;

    // Duyệt tất cả section để tìm lesson
    for (const key of ['addSections', 'bulkAddSections'] as const) {
      if (data[key]) {
        for (const section of data[key]!) {
          if (section.lessons) {
            const lesson = section.lessons.find(l => l.temp_id === lessonTempId);
            if (lesson) {
              Object.assign(lesson, updates);
              found = true;
            }
          }
        }
      }
    }

    if (data.addContents) {
      const content = data.addContents.find(c => c.temp_id === lessonTempId);
      if (content) {
        Object.assign(content, updates);
        found = true;
      }
    }

    if (!found) throw new NotFoundException('Không tìm thấy lesson');

    draft.updatedAt = new Date();
    return this.pendingChangeRepo.save(draft);
  }

  async validateBulkSections(courseId: string, teacherId: string, sections: any[]): Promise<void> {
    const course = await this.courseService.getDetail(courseId);
    if (!course) throw new NotFoundException('Course not found');
    if (course.userId !== teacherId) throw new ForbiddenException('Bạn không có quyền');

    for (const sec of sections) {
      if (!sec.title) throw new BadRequestException('Mỗi section phải có title');
      const exists = await this.sectionRepo.findOne({
        where: { course_id: courseId, title: sec.title },
      });
      if (exists) throw new BadRequestException(`Section "${sec.title}" đã tồn tại`);
    }
  }

  async batchApprove(pendingChangeIds: string[], adminId: string): Promise<{ success: string[]; failed: string[] }> {
    const success: string[] = [];
    const failed: string[] = [];

    const pendings = await this.pendingChangeRepo.find({
      where: { 
        id: In(pendingChangeIds),
        status: 'pending' 
      },
      relations: ['course', 'submittedBy'],
    });

    const validIds = pendings.map(p => p.id);
    const notFound = pendingChangeIds.filter(id => !validIds.includes(id));
    notFound.forEach(id => failed.push(id));

    await Promise.all(
      pendings.map(async (pending) => {
        try {
          await this.approvePendingChange(pending.id, adminId);
          success.push(pending.id);
        } catch (error: any) {
          console.error(`Batch approve failed for ${pending.id}:`, error.message || error);
          failed.push(pending.id);
        }
      })
    );

    return { success, failed };
}

  async batchReject(pendingChangeIds: string[], adminId: string, reason: string): Promise<{ success: string[]; failed: string[] }> {
    const success: string[] = [];
    const failed: string[] = [];

    const pendings = await this.pendingChangeRepo.find({
      where: { 
        id: In(pendingChangeIds),
        status: 'pending'
      },
      relations: ['submittedBy', 'course'],
    });

    const validIds = pendings.map(p => p.id);
    const notFound = pendingChangeIds.filter(id => !validIds.includes(id));

    await Promise.all(
      pendings.map(async (pending) => {
        try {
          pending.status = 'rejected';
          pending.adminComment = `Batch rejected by admin ${adminId} - Reason: ${reason}`;

          await this.pendingChangeRepo.save(pending);

          await this.emailService.sendPendingChangeRejectedEmail(
            pending.submittedBy.email,
            pending.course.title,
            reason
          );

          success.push(pending.id);
        } catch (error) {
          console.error(`Batch reject failed for ${pending.id}:`, error);
          failed.push(pending.id);
        }
      })
    );

    notFound.forEach(id => failed.push(id));

    return { success, failed };
  }


}