import {Body, Controller, Delete, HttpCode, UseGuards} from '@nestjs/common';
import {JwtAuthGuard} from '../../common/guards/jwt-auth.guard';
import {RolesGuard} from '../../common/guards/roles.guard';
import {Roles} from '../../common/guards/roles.decorator';
import {SystemRole} from '../../schema/entities/role.entity';
import {CourseRegistration} from '../../schema/entities/course-registration.entity';
import {Repository} from 'typeorm';
import {InjectRepository} from '@nestjs/typeorm';
import {Request} from 'express';
import {Req} from '@nestjs/common';
import {IsNotEmpty, IsString} from 'class-validator';

export class RegisterCourseDto {
    @IsString()
    @IsNotEmpty({message: 'Course ID không được để trống'})
    course_id!: string;
}

@Controller('student/registrations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StudentRegistrationController {
    constructor(
        @InjectRepository(CourseRegistration)
        private readonly registrationRepo: Repository<CourseRegistration>,
    ) {
    }

    @Delete()
    @HttpCode(200)
    @Roles(SystemRole.STUDENT)
    async cancelRegistration(@Body() dto: RegisterCourseDto, @Req() req: Request) {
        const studentId = (req as any).user?.id ?? null;

        const registration = await this.registrationRepo.findOne({
            where: {
                user_id: studentId,
                course_id: dto.course_id
            }
        });

        if (!registration) {
            throw new Error('Bạn chưa đăng ký khóa học này');
        }

        await this.registrationRepo.remove(registration);

        return { courseId: dto.course_id };
    }
}
