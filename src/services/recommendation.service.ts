import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not } from 'typeorm';
import { Course, CourseStatus, CourseVisibility } from '../schema/entities/course.entity';
import { CourseReview } from 'src/schema/entities/course-review.entity';
import { CourseRegistration } from '../schema/entities/course-registration.entity';
import { StorageService } from './storage.service';

const cosineSimilarity = require('cosine-similarity');

type CourseRecommendation = {
  course_id: string;
  title: string;
  description: string;
  thumbnail_url: string | null;
  teacher: string | null;
  price: string;
  currency: string;
  rating: number;
  score: number;
};

@Injectable()
export class RecommendationService {
  constructor(
    @InjectRepository(Course)
    private courseRepo: Repository<Course>,
    @InjectRepository(CourseRegistration)
    private registrationRepo: Repository<CourseRegistration>,
    @InjectRepository(CourseReview)
    private reviewRepo: Repository<CourseReview>,
    private storageService: StorageService,
  ) {}

  // === HELPERS ===
  private readonly STOP_WORDS = new Set([
    'and', 'or', 'but', 'for', 'in', 'on', 'the', 'a', 'an', 'to', 'with',
    'of', 'is', 'at', 'by', 'this', 'that', 'it', 'as', 'from', 'course', 'learn'
  ]);

  private tokenize(text: string): string[] {
    return (text || '')
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
      .filter(w => !this.STOP_WORDS.has(w));
  }

  private buildVocab(courses: Course[]): string[] {
    const set = new Set<string>();
    courses.forEach(c => {
      const text = `${c.title} ${c.category || ''} ${c.teacher || ''}`;
      this.tokenize(text).forEach(w => set.add(w));
    });
    return Array.from(set);
  }

  private documentFrequency = new Map<string, number>(); 
  private vocab: string[] = [];
  private N = 0; 

  private async buildVocabAndStats(courses: Course[]) {
    this.vocab = this.buildVocab(courses);
    this.N = courses.length;

    this.documentFrequency.clear();
    courses.forEach(course => {
      const words = new Set(this.tokenize(
        `${course.title} ${course.category || ''} ${course.teacher || ''}`
      ));
      words.forEach(word => {
        this.documentFrequency.set(word, (this.documentFrequency.get(word) || 0) + 1);
      });
    });
  }

  private extractFeaturesWithVocab(course: Course): number[] {
    const text = `${course.title} ${course.category || ''} ${course.teacher || ''}`;
    const words = this.tokenize(text);
    const wordCount = words.reduce((acc, w) => {
      acc[w] = (acc[w] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const totalWords = words.length || 1;

    return this.vocab.map(word => {
      const tf = (wordCount[word] || 0) / totalWords;
      const df = this.documentFrequency.get(word) || 1;
      const idf = Math.log(this.N / df);
      return tf * idf;
    });
  }

  private averageVectors(vectors: number[][]): number[] {
    if (vectors.length === 0) return [];
    const length = Math.max(...vectors.map(v => v.length));
    if (length === 0) return [];
    const sum = new Array(length).fill(0);
    vectors.forEach(v => {
      for (let i = 0; i < length; i++) {
        sum[i] += v[i] ?? 0;
      }
    });
    return sum.map(s => s / vectors.length);
  }

  private async getTotalApprovedCourses(): Promise<number> {
    return this.courseRepo.count({
      where: {
        status: CourseStatus.APPROVED,
        visibility: CourseVisibility.PUBLIC,
      },
    });
  }

  private async getAverageRating(courseId: string): Promise<number> {
    const result = await this.reviewRepo
      .createQueryBuilder('review')
      .select('COALESCE(AVG(review.rating), 0)', 'avg')
      .where('review.course_id = :courseId', { courseId })
      .getRawOne();
    return parseFloat(result?.avg ?? '0') || 0;
  }

  private async mapToResponse(item: { course: Course; score: number }): Promise<CourseRecommendation> {
    const rating = await this.getAverageRating(item.course.course_id);

    let thumbnailUrlWithSas: string | null = item.course.thumbnail_url;
    if (item.course.thumbnail_url) {
      try {
        thumbnailUrlWithSas = await this.storageService.generateSasUrlFromUrl(
          item.course.thumbnail_url,
          'image',
          1
        );
      } catch (error) {
        console.error('Failed to generate SAS token for thumbnail:', error);
      }
    }

    return {
      course_id: item.course.course_id,
      title: item.course.title,
      description: item.course.description || "",
      thumbnail_url: thumbnailUrlWithSas,
      teacher: item.course.teacher || 'Không rõ',
      price: item.course.price,
      currency: item.course.currency,
      rating,
      score: parseFloat(item.score.toFixed(4)),
    };
  }

  // === CONTENT-BASED ===
  private async getContentBasedRecommendations(
    userId: string,
    limit = 10,
  ): Promise<CourseRecommendation[]> {
    const userRegistrations = await this.registrationRepo.find({
      where: { user_id: userId, payment_status: 'PAID' },
      relations: ['course'],
    });

    if (userRegistrations.length === 0) return [];

    const registeredCourses = userRegistrations
      .map(r => r.course)
      .filter((c): c is Course => !!c);

    const allCourses = await this.courseRepo.find({
      where: {
        status: CourseStatus.APPROVED,
        visibility: CourseVisibility.PUBLIC,
      },
    });

    if (allCourses.length === 0) return [];

    await this.buildVocabAndStats(allCourses);

    const features = registeredCourses.map(c => this.extractFeaturesWithVocab(c));
    const avgFeature = this.averageVectors(features);
    if (avgFeature.every(v => v === 0)) return [];

    const similarities = allCourses
      .filter(c => !registeredCourses.some(rc => rc.course_id === c.course_id))
      .map(course => {
        const sim = cosineSimilarity(avgFeature, this.extractFeaturesWithVocab(course));
        return { course, score: sim };
      })
      .filter(s => s.score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit * 3);

    return Promise.all(similarities.map(item => this.mapToResponse(item)));
  }

  // === COLLABORATIVE ===
  private async getCollaborativeRecommendations(
    userId: string,
    limit = 10,
  ): Promise<CourseRecommendation[]> {
    const allRegistrations = await this.registrationRepo.find({
      where: { payment_status: 'PAID' },
      relations: ['course'],
    });

    if (allRegistrations.length === 0) return [];

    const userIds = [...new Set(allRegistrations.map(r => String(r.user_id)))];
    const courseIds = [...new Set(allRegistrations.map(r => String(r.course_id)))];

    if (userIds.length < 2 || courseIds.length === 0) return [];

    const matrix: Record<string, Record<string, number>> = {};
    userIds.forEach(uid => (matrix[uid] = {}));

    allRegistrations.forEach(r => {
      const uid = String(r.user_id);
      const cid = String(r.course_id);
      matrix[uid]![cid] = 1; 
    });

    const targetKey = String(userId);
    const targetCourses = matrix[targetKey] ?? {};
    if (Object.keys(targetCourses).length === 0) return [];

    const similarities: { userId: string; sim: number }[] = [];
    for (const uid of userIds) {
      if (uid === targetKey) continue;
      const sim = this.jaccardSimilarity(targetCourses, matrix[uid] ?? {});
      if (sim > 0) similarities.push({ userId: uid, sim });
    }

    if (similarities.length === 0) return [];

    const predictions: { courseId: string; score: number }[] = [];
    for (const courseId of courseIds) {
      if (targetCourses[courseId]) continue;

      let weightedSum = 0;
      for (const { userId: simUserId, sim } of similarities) {
        if (matrix[simUserId]?.[courseId]) {
          weightedSum += sim;
        }
      }

      if (weightedSum > 0) {
        predictions.push({ courseId, score: weightedSum });
      }
    }

    if (predictions.length === 0) return [];

    const topPredictions = predictions
      .sort((a, b) => b.score - a.score)
      .slice(0, limit * 2);

    const courseEntities = await this.courseRepo.find({
      where: { course_id: In(topPredictions.map(p => p.courseId)) },
    });

    const courseMap = new Map(courseEntities.map(c => [c.course_id, c]));

    const result = topPredictions
      .map(p => {
        const course = courseMap.get(p.courseId);
        return course ? { course, score: p.score } : null;
      })
      .filter((item): item is { course: Course; score: number } => !!item)
      .slice(0, limit);

    return Promise.all(result.map(item => this.mapToResponse(item)));
  }

  // === JACCARD ===
  private jaccardSimilarity(
    target: Record<string, number>,
    other: Record<string, number>,
  ): number {
    const t = new Set(Object.keys(target));
    const o = new Set(Object.keys(other));
    const inter = new Set([...t].filter(x => o.has(x)));
    const union = new Set([...t, ...o]);
    return union.size === 0 ? 0 : inter.size / union.size;
  }

  private async getUserPaidCourseIds(userId: string): Promise<string[]> {
    const regs = await this.registrationRepo.find({
      where: { user_id: userId, payment_status: 'PAID' },
      select: ['course_id'],
    });
    return regs.map(r => r.course_id);
  }

  // === HYBRID ===
  async getHybridRecommendations(
      userId: string | null,
      limit = 10,
      contentWeight = 0.7,
    ): Promise<CourseRecommendation[]> {
      const totalPaidRegistrations = await this.registrationRepo.count({
        where: { payment_status: 'PAID' },
      });

      if (totalPaidRegistrations === 0) {
        return this.getLatestCourses(limit);
      }

      if (!userId) {
        return this.getPopularCourses(limit);
      }

      const userRegistrations = await this.registrationRepo.find({
        where: { user_id: userId, payment_status: 'PAID' },
      });

      if (userRegistrations.length === 0) {
        return this.getPopularCourses(limit, userId, true); 
      }

      const allRegistrations = await this.registrationRepo.find({
        where: { payment_status: 'PAID' },
      });

      const regCountMap = new Map<string, number>();
      allRegistrations.forEach(r => {
        regCountMap.set(r.course_id, (regCountMap.get(r.course_id) ?? 0) + 1);
      });

      const [contentRecs, collabRecs] = await Promise.all([
        this.getContentBasedRecommendations(userId, limit * 3),
        this.getCollaborativeRecommendations(userId, limit * 3),
      ]);

      if (contentRecs.length === 0 && collabRecs.length === 0) {
        return this.getPopularCourses(limit, userId, true); 
      }

      const scoreMap = new Map<string, { score: number; regCount: number; rec: CourseRecommendation }>();

      // CONTENT
      contentRecs.forEach(rec => {
        const regCount = regCountMap.get(rec.course_id) ?? 0;
        const current = scoreMap.get(rec.course_id);
        const newScore = rec.score * contentWeight;
        if (!current || newScore > current.score) {
          scoreMap.set(rec.course_id, { score: newScore, regCount, rec });
        }
      });

      // COLLAB
      collabRecs.forEach(rec => {
        const regCount = regCountMap.get(rec.course_id) ?? 0;
        const current = scoreMap.get(rec.course_id);
        const newScore = (current?.score ?? 0) + rec.score * (1 - contentWeight);
        if (!current || newScore > current.score) {
          scoreMap.set(rec.course_id, { score: newScore, regCount, rec });
        }
      });

      let finalList = Array.from(scoreMap.values())
        .sort((a, b) => {
          if (Math.abs(a.score - b.score) > 0.01) return b.score - a.score;
          return b.regCount - a.regCount;
        })
        .map(item => ({
          ...item.rec,
          score: parseFloat(item.score.toFixed(4)),
        }));

      if (finalList.length < limit) {
        const popular = await this.getPopularCourses(limit * 2, userId, true);
        const existingIds = new Set(finalList.map(r => r.course_id));
        const additional = popular
          .filter(p => !existingIds.has(p.course_id))
          .slice(0, limit - finalList.length);
        finalList = finalList.concat(additional);
      }

      const latestCourses = await this.getLatestCourses(5, userId);
      const currentIds = new Set(finalList.map(r => r.course_id));
      const newOnes = latestCourses
        .filter(c => !currentIds.has(c.course_id))
        .slice(0, 3);

      if (newOnes.length > 0) {
        if (finalList.length >= limit) {
          finalList = finalList.slice(0, limit - newOnes.length);
        }
        finalList = finalList.concat(newOnes);
      }

      return finalList.slice(0, limit);
    }

  // === POPULAR COURSES ===
  async getPopularCourses(limit: number = 10, userId?: string, excludePurchased: boolean = false): Promise<CourseRecommendation[]> {
      const excludeIds = (excludePurchased && userId) ? await this.getUserPaidCourseIds(userId) : [];

      // 1. LẤY KHÓA HỌC PHỔ BIẾN (có lượt mua)
      const popularRaw = await this.registrationRepo
        .createQueryBuilder('reg')
        .select('reg.course_id', 'course_id')
        .addSelect('COUNT(reg.registration_id)', 'purchase_count')
        .addSelect('COALESCE(AVG(rev.rating), 0)', 'avg_rating')
        .addSelect('COUNT(rev.review_id)', 'review_count')
        .addSelect('MAX(c.created_at)', 'created_at')
        .innerJoin('reg.course', 'c')
        .leftJoin('course_reviews', 'rev', 'rev.course_id = reg.course_id')
        .where('c.status = :status', { status: CourseStatus.APPROVED })
        .andWhere('c.visibility = :visibility', { visibility: CourseVisibility.PUBLIC })
        .andWhere('reg.payment_status = :paid', { paid: 'PAID' })
        .groupBy('reg.course_id')
        .addGroupBy('c.created_at')
        .having('COUNT(reg.registration_id) > 0')
        .orderBy('purchase_count', 'DESC')
        .addOrderBy('avg_rating', 'DESC')
        .limit(limit * 3)
        .getRawMany();

      let recommendations: CourseRecommendation[] = [];
      const now = new Date();
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

      // 2. Xử lý khóa phổ biến
      if (popularRaw.length > 0) {
        const courseIds = popularRaw.map(p => p.course_id);
        const courses = await this.courseRepo.find({
          where: { course_id: In(courseIds) },
        });
        const courseMap = new Map(courses.map(c => [c.course_id, c]));

        const maxPurchase = Math.max(...popularRaw.map(p => Number(p.purchase_count)), 1);

        for (const item of popularRaw) {
          const course = courseMap.get(item.course_id);
          if (!course) continue;

          const purchaseCount = Number(item.purchase_count);
          const avgRating = Number(item.avg_rating);
          const createdAt = new Date(item.created_at);
          const isNew = (now.getTime() - createdAt.getTime()) < THIRTY_DAYS_MS;

          let score = 0.6;
          score += 0.3 * (purchaseCount / maxPurchase);
          score += 0.1 * (avgRating / 5);
          if (isNew && avgRating >= 4.0) score += 0.1;
          score = Math.min(1, score);

          let thumbnailUrlWithSas = course.thumbnail_url;
          if (course.thumbnail_url) {
            try {
              thumbnailUrlWithSas = await this.storageService.generateSasUrlFromUrl(
                course.thumbnail_url,
                'image',
                1
              );
            } catch (error) {
              console.error('SAS Error:', error);
            }
          }

          recommendations.push({
            course_id: course.course_id,
            title: course.title,
            description: course.description || course.course_description || '',
            thumbnail_url: thumbnailUrlWithSas,
            teacher: course.teacher ?? 'Không rõ',
            price: course.price,
            currency: course.currency,
            rating: Math.round(avgRating * 10) / 10,
            score: parseFloat(score.toFixed(4)),
          });
        }
      }

      // Lọc loại trừ course đã mua nếu excludePurchased
      if (excludePurchased && excludeIds.length > 0) {
        recommendations = recommendations.filter(rec => !excludeIds.includes(rec.course_id));
      }

      // 3. Bổ sung khóa mới nhất nếu thiếu
      if (recommendations.length < limit) {
        const needed = limit - recommendations.length;
        const alreadyIncludedIds = recommendations.map(r => r.course_id);
        const finalExcludeIds = excludePurchased ? [...excludeIds, ...alreadyIncludedIds] : alreadyIncludedIds;

        const latestCourses = await this.courseRepo.find({
          where: {
            status: CourseStatus.APPROVED,
            visibility: CourseVisibility.PUBLIC,
            ...(finalExcludeIds.length > 0 && {
              course_id: Not(In(finalExcludeIds)),
            }),
          },
          order: { created_at: 'DESC' },
          take: needed * 2,
        });

        for (const course of latestCourses) {
          let thumbnailUrlWithSas = course.thumbnail_url;
          if (course.thumbnail_url) {
            try {
              thumbnailUrlWithSas = await this.storageService.generateSasUrlFromUrl(
                course.thumbnail_url,
                'image',
                1
              );
            } catch (error) {
              console.error('SAS Error latest:', error);
            }
          }

          recommendations.push({
            course_id: course.course_id,
            title: course.title,
            description: course.description || course.course_description || '',
            thumbnail_url: thumbnailUrlWithSas,
            teacher: course.teacher ?? 'Không rõ',
            price: course.price,
            currency: course.currency,
            rating: 0,
            score: 0,
          });
        }
      }

      // 4. Sắp xếp cuối cùng
      return recommendations
        .sort((a, b) => {
          if (a.score === 0) return 1;
          if (b.score === 0) return -1;
          return b.score - a.score;
        })
        .slice(0, limit);
    }
    
  async getLatestCourses(limit: number = 10, userId?: string): Promise<CourseRecommendation[]> {
    const excludeIds = userId ? await this.getUserPaidCourseIds(userId) : [];
    const whereClause: any = {
      status: CourseStatus.APPROVED,
      visibility: CourseVisibility.PUBLIC,
    };
    if (excludeIds.length > 0) {
      whereClause.course_id = Not(In(excludeIds));
    }
    const courses = await this.courseRepo.find({
      where: whereClause,
      order: {
        created_at: 'DESC',
      },
      take: limit,
    });

    const result: CourseRecommendation[] = [];

    for (const course of courses) {
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

      result.push({
        course_id: course.course_id,
        title: course.title,
        description: course.description ?? "",
        thumbnail_url: thumbnailUrlWithSas,
        teacher: course.teacher ?? 'Không rõ',
        price: course.price,
        currency: course.currency,
        rating: 0,
        score: 0,
      });
    }

    return result;
  }
}