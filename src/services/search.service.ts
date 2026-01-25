import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, ILike, LessThan, MoreThan, MoreThanOrEqual, LessThanOrEqual, Raw, Repository } from 'typeorm';
import { Course } from '../schema/entities/course.entity';
import { SearchHistory } from '../schema/entities/search-history.entity';
import { User } from '../schema/entities/user.entity';
import { StorageService } from './storage.service';
import axios from 'axios';
import * as dotenv from 'dotenv';
import Fuse from "fuse.js";
dotenv.config();

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(Course)
    private readonly courseRepo: Repository<Course>,
    @InjectRepository(SearchHistory)
    private readonly historyRepo: Repository<SearchHistory>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly storageService: StorageService,
  ) {}

    async searchCourses(
      userId: string | null,
      query: {
        category: any;
        q?: string;
        top_k?: number;

        category_id?: string;
        min_price?: string | number;
        max_price?: string | number;
        min_duration?: string | number;
        max_duration?: string | number;
        teacher?: string;
      }
    ) {
      const text = query.q?.trim() || '';
      const top_k = query.top_k ?? 10;

      const findOptions: any = {
        select: [
          'course_id',
          'title',
          'description',
          'price',
          'currency',
          'category',
          'status',
          'visibility',
          'course_duration',
          'teacher',
          'discount_amount',
          'course_description',
          'thumbnail_url',
          'created_at',
          'is_paid',
        ],
      where: {
          status: 'APPROVED',
          visibility: 'PUBLIC',
        },
      };

      // 1. Category
      if (query.category) {
        findOptions.where.category = ILike(`%${query.category}%`);
      }

      // 2. Price range
      const minPrice = query.min_price ? Number(query.min_price) : undefined;
      const maxPrice = query.max_price ? Number(query.max_price) : undefined;

      if (minPrice !== undefined && !isNaN(minPrice) && maxPrice !== undefined && !isNaN(maxPrice)) {
        findOptions.where.price = Between(minPrice.toString(), maxPrice.toString());
      } else if (minPrice !== undefined && !isNaN(minPrice)) {
        findOptions.where.price = MoreThanOrEqual(minPrice.toString());
      } else if (maxPrice !== undefined && !isNaN(maxPrice)) {
        findOptions.where.price = LessThanOrEqual(maxPrice.toString());
      }

      // 3. Teacher
      if (query.teacher) {
        findOptions.where.teacher = ILike(`%${query.teacher}%`);
      }

      // 4. Duration range (in hours)
      const minDuration = query.min_duration ? Number(query.min_duration) : undefined;
      const maxDuration = query.max_duration ? Number(query.max_duration) : undefined;

      if (minDuration !== undefined && !isNaN(minDuration) && maxDuration !== undefined && !isNaN(maxDuration)) {
        findOptions.where.course_duration = Raw(
          alias => `CAST(NULLIF(${alias}, '') AS NUMERIC) BETWEEN ${minDuration} AND ${maxDuration}`
        );
      } else if (minDuration !== undefined && !isNaN(minDuration)) {
        findOptions.where.course_duration = Raw(
          alias => `CAST(NULLIF(${alias}, '') AS NUMERIC) >= ${minDuration}`
        );
      } else if (maxDuration !== undefined && !isNaN(maxDuration)) {
        findOptions.where.course_duration = Raw(
          alias => `CAST(NULLIF(${alias}, '') AS NUMERIC) <= ${maxDuration}`
        );
      }

      const courses = await this.courseRepo.find(findOptions);

      let results;
      if (text) {
        const fuse = new Fuse(courses, {
          keys: ['title', 'description'],
          threshold: 0.4,
          ignoreLocation: true,
          minMatchCharLength: 2,
        });
        results = fuse.search(text).slice(0, top_k).map(r => r.item);
      } else {
        results = courses.slice(0, top_k);
      }

      const resultsWithSasUrls = await Promise.all(
        results.map(async (course) => {
          let thumbnailSasUrl = null;
          if (course.thumbnail_url) {
            try {
              thumbnailSasUrl = await this.storageService.generateSasUrlFromUrl(
                course.thumbnail_url,
                'image',
                24
              );
            } catch (error) {
              console.error('Error generating SAS URL for thumbnail:', error);
            }
          }

          return {
            courseId: String(course.course_id),
            title: course.title || '',
            description: course.description || '',
            price: course.price || '0.00',
            currency: course.currency || 'VND',
            category: course.category || null,
            status: course.status || 'APPROVED',
            visibility: course.visibility || 'PUBLIC',
            courseDuration: course.course_duration || null,
            teacher: course.teacher || null,
            discountAmount: course.discount_amount || '0.00',
            courseDescription: course.course_description || course.description || '',
            thumbnailUrl: thumbnailSasUrl,
            createdAt: course.created_at,
            isPaid: course.is_paid ?? true,
            accessStatus: 'FREE',
            progress: 0,
          };
        })
      );

      if (userId) {
        const existing = await this.historyRepo.findOne({
          where: { keyword: text, user: { id: userId } },
          relations: ['user'],
        });

        if (existing) {
          existing.created_at = new Date();
          await this.historyRepo.save(existing);
        } else {
          const user = await this.userRepo.findOne({ where: { id: userId } });
          if (user) {
            await this.historyRepo.save(
              this.historyRepo.create({
                user,
                keyword: text,
                created_at: new Date(),
              })
            );
          }
        }
      }

      return resultsWithSasUrls;
    }

    async getAutocompleteSuggestions(
        userId: string | null,
        q: string,
        limit = 10,
      ): Promise<{ keyword: string; highlighted: string }[]> {
        if (!q || q.trim().length < 2) return [];

        const prefix = q.trim().toLowerCase();

        const [personal, popular, courseTitles] = await Promise.all([
          userId ? this.getPersonalHistory(prefix, userId, limit) : Promise.resolve([]),
          this.getPopularKeywords(prefix, limit * 2),
          this.getCourseTitleSuggestions(prefix, limit * 2),
        ]);

        const scoreMap = new Map<string, number>();

        const add = (keyword: string, score: number) => {
          const key = keyword.toLowerCase().trim();
          if (key.startsWith(prefix) && key.length > prefix.length) {
            scoreMap.set(key, (scoreMap.get(key) || 0) + score);
          }
        };

        // 1. Ưu tiên lịch sử cá nhân (cao nhất)
        personal.forEach((kw, i) => add(kw, 1000 - i * 10));

        // 2. Từ khóa được tìm nhiều (global hot)
        popular.forEach((item) => {
          add(item.keyword, 100 + Number(item.count) * 2 + item.recent_boost);
        });

        // 3. Title khóa học chính xác
        courseTitles.forEach((c, i) => {
          add(c.title, 80 - i);
        });

        return Array.from(scoreMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, limit)
          .map(([keyword]) => ({
            keyword,
            highlighted: this.highlightKeyword(keyword, prefix),
          }));
      }

      // Helper: highlight từ khóa
      private highlightKeyword(text: string, prefix: string): string {
        const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escaped})`, 'gi');
        return text.replace(regex, '<strong>$1</strong>');
      }

      // Lấy lịch sử cá nhân
      private async getPersonalHistory(prefix: string, userId: string, limit: number) {
        const items = await this.historyRepo
          .createQueryBuilder('h')
          .select('h.keyword')
          .where('h.user_id = :userId', { userId })
          .andWhere('LOWER(h.keyword) LIKE :prefix', { prefix: `${prefix}%` })
          .orderBy('h.created_at', 'DESC')
          .limit(limit)
          .getMany();

        return items.map((i) => i.keyword);
      }

      // Từ khóa được tìm nhiều nhất toàn cục
      private async getPopularKeywords(prefix: string, limit: number) {
        return await this.historyRepo
          .createQueryBuilder('h')
          .select('h.keyword')
          .addSelect('COUNT(*)', 'count')
          .addSelect(
            'EXTRACT(EPOCH FROM (NOW() - MAX(h.created_at)))',
            'last_seen_seconds',
          )
          .where('LOWER(h.keyword) LIKE :prefix', { prefix: `${prefix}%` })
          .groupBy('h.keyword')
          .orderBy('count', 'DESC')
          .addOrderBy('MAX(h.created_at)', 'DESC')
          .limit(limit)
          .getRawMany()
          .then((rows) =>
            rows.map((r) => ({
              keyword: r.h_keyword,
              count: Number(r.count),
              recent_boost: Math.max(0, 50 - Number(r.last_seen_seconds) / 3600), // gần đây + điểm
            })),
          );
      }

      // Title khóa học
      private async getCourseTitleSuggestions(prefix: string, limit: number) {
        return await this.courseRepo
          .createQueryBuilder('c')
          .select('c.title')
          .where('c.status = :status AND c.visibility = :visibility', {
            status: 'APPROVED',
            visibility: 'PUBLIC',
          })
          .andWhere('LOWER(c.title) LIKE :like', { like: `${prefix}%` })
          .orderBy('c.created_at', 'DESC')
          .limit(limit)
          .getMany();
      }

      // Ghi lịch sử tìm kiếm (tách riêng cho dễ reuse)
      private async saveSearchHistory(userId: string, keyword: string) {
        if (!keyword.trim()) return;

        const existing = await this.historyRepo.findOne({
          where: { keyword: keyword.trim(), user: { id: userId } },
        });

        if (existing) {
          existing.created_at = new Date();
          await this.historyRepo.save(existing);
        } else {
          const user = this.userRepo.create({ id: userId });
          await this.historyRepo.save(
            this.historyRepo.create({
              keyword: keyword.trim(),
              user,
              created_at: new Date(),
            }),
          );
        }
      }

    async getSearchHistory(userId: string) {
      return this.historyRepo.find({
        where: { user: { id: userId } },
        order: { created_at: 'DESC' },
      });
    }

    async deleteSearchHistory(userId: string, searchId: number) {
      const history = await this.historyRepo.findOne({
        where: { search_id: String(searchId), user: { id: userId } },
        relations: ['user'],
      });

      if (!history) {
        throw new Error('Search history not found or not yours');
      }

      await this.historyRepo.remove(history);
      return { message: 'Deleted successfully' };
    }

}
