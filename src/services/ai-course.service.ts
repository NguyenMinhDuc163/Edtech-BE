import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';

import { Course, CourseCategory, CourseStatus, CourseVisibility } from '../schema/entities/course.entity';
import { CourseSection } from '../schema/entities/course-section.entity';
import { CourseContent } from '../schema/entities/course-content.entity';
import { AISyllabusResponse } from '../schema/dtos/ai-syllabus-response.dto';

@Injectable()
export class AICourseService {
  constructor(
    @InjectRepository(Course)
    private readonly courseRepo: Repository<Course>,

    @InjectRepository(CourseSection)
    private readonly sectionRepo: Repository<CourseSection>,

    @InjectRepository(CourseContent)
    private readonly contentRepo: Repository<CourseContent>,
  ) {}


    async generateSyllabus(instruction: string) {
    if (!instruction) {
        throw new BadRequestException('Instruction is required');
    }

    const aiUrl = process.env.AI_SYLLABUS_API_URL;
    if (!aiUrl) {
        throw new Error('AI_SYLLABUS_API_URL is not defined');
    }

    const response = await axios.post(
        aiUrl,
        { instruction },
        { headers: { 'Content-Type': 'application/json' } },
    );

    const aiData = response.data;


    if (
        aiData &&
        typeof aiData.courseTitle === 'string' &&
        Array.isArray(aiData.sections)
    ) {
        return aiData;
    }


    if (typeof aiData?.syllabus === 'string') {
        return this.parseTextSyllabus(aiData.syllabus);
    }

    throw new BadRequestException(
        'Invalid syllabus format returned from AI',
    );
    }


    async previewCourseFromAI(instruction: string) {
        return this.generateSyllabus(instruction);
    }

    async importFromSyllabus(
    data: {
        syllabus: AISyllabusResponse;
        thumbnail_url?: string | undefined;
    },
    teacherId: string,
    ): Promise<Course> {
    const { syllabus, thumbnail_url } = data;

    const course = this.courseRepo.create({
        title: syllabus.courseTitle,
        description: syllabus.objective || '',
        category: CourseCategory.PROGRAMMING_FOUNDATION,
        user_id: teacherId,
        status: CourseStatus.DRAFT,
        visibility: CourseVisibility.PRIVATE,

        thumbnail_url: thumbnail_url || null,
    });

    await this.courseRepo.save(course);

    let sectionIndex = 1;

    for (const sectionData of syllabus.sections) {
        const section = this.sectionRepo.create({
        title: sectionData.title,
        course_id: course.course_id,
        order_index: sectionIndex++,
        });

        await this.sectionRepo.save(section);

        for (const lesson of sectionData.lessons) {
        const content = this.contentRepo.create({
            title: lesson.title,
            courses_id: course.course_id,
            section_id: section.section_id,
        });

        await this.contentRepo.save(content);
        }
    }

    return course;
    }

    private parseTextSyllabus(text: string): AISyllabusResponse {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    let courseTitle = '';
    let objective = '';
    const sections: any[] = [];

    let currentSection: any = null;

    for (const line of lines) {
        if (!courseTitle) {
        courseTitle = line;
        continue;
        }

        if (line.startsWith('Mục tiêu:')) {
        objective = line.replace('Mục tiêu:', '').trim();
        continue;
        }

        if (line.startsWith('Chương')) {
        currentSection = {
            title: line,
            lessons: [],
        };
        sections.push(currentSection);
        continue;
        }

        if (line.startsWith('Bài') && currentSection) {
        currentSection.lessons.push({
            title: line,
        });
        }
    }

    return {
        courseTitle,
        objective,
        sections,
    };
    }

}
