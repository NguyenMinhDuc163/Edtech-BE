import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CourseReview } from '../schema/entities/course-review.entity';
import { Course } from '../schema/entities/course.entity';
import { CreateCourseReviewDto } from '../schema/dtos/create-course-review.dto';
import { UpdateCourseReviewDto } from '../schema/dtos/update-course-review.dto';
import { UserService } from './user.service';

@Injectable()
export class CourseReviewService {
    constructor(
        @InjectRepository(CourseReview)
        private readonly reviewRepo: Repository<CourseReview>,
        @InjectRepository(Course)
        private readonly courseRepo: Repository<Course>,
        private readonly userService: UserService,
    ) { }

    async upsertReview(courseId: string, userId: string, dto: CreateCourseReviewDto): Promise<CourseReview> {
        const existingReview = await this.reviewRepo.findOne({
            where: { course_id: courseId, user_id: userId },
            relations: ['course', 'course.owner'], 
        });

        let review: CourseReview;

        if (existingReview) {
            // Update existing review
            if (dto.rating !== undefined) existingReview.rating = dto.rating;
            if (dto.title !== undefined) existingReview.title = dto.title;
            if (dto.content !== undefined) existingReview.content = dto.content;

            review = await this.reviewRepo.save(existingReview);
        } else {
            // Create new review
            review = this.reviewRepo.create({
                course_id: courseId,
                user_id: userId,
                rating: dto.rating,
                title: dto.title || null,
                content: dto.content || null,
            });

            review = await this.reviewRepo.save(review);
        }

        const course = await this.courseRepo.findOne({
            where: { course_id: courseId },
            relations: ['owner'],
        });

        if (course?.owner) {
            if (dto.rating >= 4) {
                await this.userService.increaseTrustScore(course.owner.id, 5);
            } else if (dto.rating <= 2) {
                await this.userService.decreaseTrustScore(course.owner.id, 5);
            }
        }

        return review;
    }


    async getCourseReviews(courseId: string, page: number = 1, limit: number = 10) {
        const skip = (page - 1) * limit;

        const [reviews, total] = await this.reviewRepo.findAndCount({
            where: { course_id: courseId },
            relations: ['user'],
            order: { created_at: 'DESC' },
            skip,
            take: limit,
        });

        return {
            reviews: reviews.map(review => ({
                review_id: review.review_id,
                rating: review.rating,
                title: review.title,
                content: review.content,
                created_at: review.created_at,
                updated_at: review.updated_at,
                user: {
                    id: review.user.id,
                    username: review.user.username,
                },
            })) || [],
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        };
    }

    async getReviewById(reviewId: string) {
        const review = await this.reviewRepo.findOne({
            where: { review_id: reviewId },
            relations: ['user'],
        });

        if (!review) {
            throw new NotFoundException('Đánh giá không tồn tại');
        }

        return {
            review_id: review.review_id,
            rating: review.rating,
            title: review.title,
            content: review.content,
            created_at: review.created_at,
            updated_at: review.updated_at,
            user: {
                id: review.user.id,
                username: review.user.username,
            },
        };
    }

    async updateReview(reviewId: string, userId: string, dto: UpdateCourseReviewDto): Promise<CourseReview> {
        const review = await this.reviewRepo.findOne({
            where: { review_id: reviewId }
        });

        if (!review) {
            throw new NotFoundException('Đánh giá không tồn tại');
        }

        if (review.user_id !== userId) {
            throw new ForbiddenException('Bạn không có quyền sửa đánh giá này');
        }

        if (dto.rating !== undefined) review.rating = dto.rating;
        if (dto.title !== undefined) review.title = dto.title;
        if (dto.content !== undefined) review.content = dto.content;

        return await this.reviewRepo.save(review);
    }

    async deleteReview(reviewId: string, userId: string): Promise<void> {
        const review = await this.reviewRepo.findOne({
            where: { review_id: reviewId }
        });

        if (!review) {
            throw new NotFoundException('Đánh giá không tồn tại');
        }

        if (review.user_id !== userId) {
            throw new ForbiddenException('Bạn không có quyền xóa đánh giá này');
        }

        await this.reviewRepo.remove(review);
    }

    async getUserReview(courseId: string, userId: string) {
        const review = await this.reviewRepo.findOne({
            where: { course_id: courseId, user_id: userId },
            relations: ['user'],
        });

        if (!review) {
            return null;
        }

        return {
            review_id: review.review_id,
            rating: review.rating,
            title: review.title,
            content: review.content,
            created_at: review.created_at,
            updated_at: review.updated_at,
            user: {
                id: review.user.id,
                username: review.user.username,
            },
        };
    }

    async getCourseReviewStats(courseId: string) {
        const stats = await this.reviewRepo
            .createQueryBuilder('review')
            .select('AVG(review.rating)', 'averageRating')
            .addSelect('COUNT(review.review_id)', 'totalReviews')
            .addSelect('COUNT(review_comments.comment_id)', 'totalComments')
            .leftJoin('review.comments', 'review_comments')
            .where('review.course_id = :courseId', { courseId })
            .getRawOne();

        return {
            courseId,
            averageRating: parseFloat(stats.averageRating) || 0,
            totalReviews: parseInt(stats.totalReviews) || 0,
            totalComments: parseInt(stats.totalComments) || 0,
        };
    }
}
