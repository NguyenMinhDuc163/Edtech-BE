import {Controller, Post, Body, UseGuards, HttpCode, Req} from '@nestjs/common';
import {JwtAuthGuard} from '../../common/guards/jwt-auth.guard';
import {RolesGuard} from '../../common/guards/roles.guard';
import {Roles} from '../../common/guards/roles.decorator';
import {SystemRole} from '../../schema/entities/role.entity';
import {CourseContent} from '../../schema/entities/course-content.entity';
import {ContentFile} from '../../schema/entities/content-file.entity';
import {Repository} from 'typeorm';
import {InjectRepository} from '@nestjs/typeorm';
import {IsString, IsArray, IsIn} from 'class-validator';

export class SetPreviewDto {
    @IsString()
    course_id!: string;

    @IsString()
    @IsIn(['Y', 'N'])
    is_preview!: string;

    @IsArray()
    content_ids!: string[];
}

@Controller('admin/course-preview')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CoursePreviewController {
    constructor(
        @InjectRepository(CourseContent)
        private readonly contentRepo: Repository<CourseContent>,
        @InjectRepository(ContentFile)
        private readonly fileRepo: Repository<ContentFile>,
    ) {}

    @Post('set')
    @HttpCode(200)
    @Roles(SystemRole.ADMIN, SystemRole.TEACHER)
    async setPreview(@Body() dto: SetPreviewDto, @Req() req: any) {
        console.log('User object:', req.user);
        console.log('User role:', req.user?.role);
        const {course_id, is_preview, content_ids} = dto;

        
        for (const content_id of content_ids) {
            await this.contentRepo.update(
                {content_id, courses_id: course_id},
                {is_preview: is_preview}
            );

            
            await this.fileRepo.update(
                {content: {content_id, courses_id: course_id}},
                {is_preview: is_preview}
            );
        }

        return {
            code: 200,
            message: `Đã set ${content_ids.length} nội dung thành ${is_preview === 'Y' ? 'preview' : 'không preview'}`,
            data: {
                course_id,
                is_preview,
                content_ids
            },
            error: null,
        };
    }
}
