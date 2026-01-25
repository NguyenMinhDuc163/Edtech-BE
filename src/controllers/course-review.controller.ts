import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Request, BadRequestException, HttpCode } from '@nestjs/common';
import { CourseReviewService } from '../services/course-review.service';
import { CreateCourseReviewDto } from '../schema/dtos/create-course-review.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/guards/roles.decorator';
import { SystemRole } from '../schema/entities/role.entity';

@Controller('courses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CourseReviewController {
    constructor(private readonly reviewService: CourseReviewService) { }

    @Post(':courseId/reviews')
    @HttpCode(200)
    @Roles(SystemRole.STUDENT, SystemRole.TEACHER)
    async upsertReview(
        @Param('courseId') courseId: string,
        @Body() dto: CreateCourseReviewDto,
        @Request() req: any
    ) {
        const userId = req.user?.id;

        if (!userId) {
            throw new BadRequestException('Không tìm thấy thông tin người dùng');
        }

        return await this.reviewService.upsertReview(courseId, userId, dto);
    }

    @Get(':courseId/reviews')
    @HttpCode(200)
    @Roles(SystemRole.STUDENT, SystemRole.TEACHER, SystemRole.ADMIN)
    async getCourseReviews(
        @Param('courseId') courseId: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string
    ) {
        const pageNum = page ? parseInt(page) : 1;
        const limitNum = limit ? parseInt(limit) : 10;
        return await this.reviewService.getCourseReviews(courseId, pageNum, limitNum);
    }

    @Get(':courseId/reviews/stats')
    @HttpCode(200)
    @Roles(SystemRole.STUDENT, SystemRole.TEACHER, SystemRole.ADMIN)
    async getCourseReviewStats(@Param('courseId') courseId: string) {
        return await this.reviewService.getCourseReviewStats(courseId);
    }

    @Get(':courseId/reviews/my')
    @HttpCode(200)
    @Roles(SystemRole.STUDENT, SystemRole.TEACHER, SystemRole.ADMIN)
    async getMyReview(
        @Param('courseId') courseId: string,
        @Request() req: any
    ) {
        const userId = req.user.id;
        return await this.reviewService.getUserReview(courseId, userId);
    }

    @Get('reviews/:reviewId')
    @HttpCode(200)
    @Roles(SystemRole.STUDENT, SystemRole.TEACHER, SystemRole.ADMIN)
    async getReviewById(@Param('reviewId') reviewId: string) {
        return await this.reviewService.getReviewById(reviewId);
    }

    @Delete('reviews/:reviewId')
    @HttpCode(200)
    @Roles(SystemRole.STUDENT, SystemRole.TEACHER)
    async deleteReview(
        @Param('reviewId') reviewId: string,
        @Request() req: any
    ) {
        const userId = req.user.id;
        await this.reviewService.deleteReview(reviewId, userId);
        return { message: 'Đánh giá đã được xóa thành công' };
    }
}
