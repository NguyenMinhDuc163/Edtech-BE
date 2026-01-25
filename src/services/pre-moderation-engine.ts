import { BadRequestException, Injectable } from '@nestjs/common';
import { Repository, MoreThan } from 'typeorm';
import { PendingChange } from '../schema/entities/pending-change.entity';
import { Course, CourseStatus } from '../schema/entities/course.entity';
import { jaroWinkler } from '../utils/jaro-winkler';
import { CosineSimilarity } from '../utils/cosine-similarity';
import { User } from 'src/schema/entities/user.entity';
import { UserService } from './user.service';

@Injectable()
export class PreModerationEngine {
  constructor(private readonly userService: UserService) {}
  private static readonly BADWORDS: (string | RegExp)[] = [
    'địt', 'lồn', 'cặc', 'đéo', 'đm', 'clmm', 'cc', 'vcl', 'đjt', 'vl', 'đĩ', 'cave', 'porn', 'sex',
    'đảng', 'chính phủ', 'cờ bạc', 'ma túy', 'đá gà', 'lô đề',
    /bit\.ly|tinyurl|shopee\.vn\/aff|tiki\.vn\/aff|link\.shop|tokhai\.com/i
  ];

  static async validatePendingChange(
    changeData: any,
    userId: string,
    pendingRepo: Repository<PendingChange>,
    courseRepo: Repository<Course>
  ): Promise<void> {
    const reasons: string[] = [];

    // 1. Từ cấm + link xấu
    const text = JSON.stringify(changeData).toLowerCase();
    for (const bad of this.BADWORDS) {
      if (typeof bad === 'string' && text.includes(bad)) reasons.push(`Từ cấm: "${bad}"`);
      if (bad instanceof RegExp && bad.test(text)) reasons.push(`Link rút gọn/affiliate không cho phép`);
    }

    // 2. Lấy sections & contents
    const sections = [
      ...(changeData.addSections || []),
      ...(changeData.bulkAddSections || []),
      ...(changeData.updateSections || [])
    ];
    const contents = [
      ...(changeData.addContents || []),
      ...(changeData.updateContents || [])
    ];

    // 3. Kiểm tra tiêu đề, độ dài
    for (const s of sections) {
      if (!s.title || s.title.trim().length < 5) reasons.push(`Tiêu đề chương quá ngắn`);
      if (!s.description || s.description.trim().length < 30) reasons.push(`Mô tả chương quá ngắn`);
    }
    for (const c of contents) {
      if (!c.title || c.title.trim().length < 10) reasons.push(`Tiêu đề bài học quá ngắn`);
    }

    const oneHourAgo = new Date(Date.now() - 3600000);
    const recent = await pendingRepo.count({
      where: { submittedBy: { id: userId }, createdAt: MoreThan(oneHourAgo) }
    });
    if (recent >= 5) reasons.push(`Tạo quá nhanh (tối đa 5/giờ)`);

    if ((sections.length || contents.length) && changeData) {
      const approvedCourses = await courseRepo.find({
        where: { status: CourseStatus.APPROVED },
        select: ['title', 'description']
      });

      if (approvedCourses.length > 0) {
        const newText = [
          ...sections.map((s: any) => `${s.title || ''} ${s.description || ''}`),
          ...contents.map((c: any) => c.title || '')
        ].join(' ').trim();

        const allExistingTexts = approvedCourses.map(c => `${c.title || ''} ${c.description || ''}`);

        for (const c of approvedCourses) {
          const titleMatch = sections.some((s: any) =>
            s.title && c.title && jaroWinkler(s.title, c.title) > 0.90
          );
          const sim = CosineSimilarity.similarity(newText, `${c.title || ''} ${c.description || ''}`, allExistingTexts);

          if (titleMatch || sim > 0.78) {
            reasons.push(
              titleMatch
                ? `Tiêu đề giống khóa: "${c.title}"`
                : `Nội dung giống ${(sim * 100).toFixed(1)}% với khóa "${c.title}"`
            );
            break;
          }
        }
      }
    }

    if (reasons.length > 0) {
      throw new BadRequestException({
        message: 'Thay đổi bị từ chối tự động bởi hệ thống kiểm duyệt',
        errors: {
          reasons,          
          autoRejected: true
        }
      });
    }
  }
  static async calculateRiskScore(
    pendingChange: PendingChange,
    user: User,
    userService: UserService
  ): Promise<number> {
    
    let riskScore = 0;

    // Tài khoản mới hay cũ
    const accountAgeDays = (Date.now() - new Date(user.created_at).getTime()) / (1000 * 3600 * 24);
    if (accountAgeDays < 60) riskScore += 30;     
    else if (accountAgeDays < 1800) riskScore += 20; 
    else riskScore += 10;                          

    // Lịch sử vi phạm gần đây
    const violations = await userService.getRecentViolationCount(user.id);
    riskScore += Math.min(violations * 10, 100);

    // Mức độ thay đổi
    let changeData = pendingChange.changeData;

    if (typeof changeData === 'string') {
      try {
        changeData = JSON.parse(changeData);
      } catch {
        changeData = {};
      }
    }

    let changeMagnitude = 0;

    if (changeData) {
      const addSections = changeData.addSections?.length || 0;
      const bulkSections = changeData.bulkAddSections?.length || 0;
      const addContents = changeData.addContents?.length || 0;
      const updateSections = Object.keys(changeData.updateSections || {}).length;
      const updateContents = Object.keys(changeData.updateContents || {}).length;

      changeMagnitude += bulkSections * 5;
      changeMagnitude += addSections * 3;
      changeMagnitude += addContents * 2;
      changeMagnitude += updateSections * 1;
      changeMagnitude += updateContents * 1;
    }

    riskScore += Math.min(changeMagnitude, 40); 

    if (riskScore > 100) riskScore = 100;

    return riskScore;
  }
}