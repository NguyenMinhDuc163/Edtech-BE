import { 
  Body, 
  Controller, 
  Delete, 
  Get, 
  HttpCode, 
  Param, 
  Patch, 
  Post, 
  Put, 
  Query, 
  Req, 
  UseGuards 
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/guards/roles.decorator';
import { SystemRole } from '../schema/entities/role.entity';
import { SectionService } from '../services/section.service';
import { CreateSectionDto } from '../schema/dtos/create-section.dto';
import { UpdateSectionDto } from '../schema/dtos/update-section.dto';
import { Request } from 'express';

@Controller('sections')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SectionController {
  constructor(private readonly sectionService: SectionService) {}

  @Post()
  @HttpCode(201)
  @Roles(SystemRole.TEACHER, SystemRole.ADMIN)
  async create(@Body() dto: CreateSectionDto, @Req() req: Request) {
    const ownerId = (req as any).user?.id ?? null;
    const created = await this.sectionService.create(dto, ownerId);

    if ('id' in created) {
      return {
        pendingId: String(created.id),
        courseId: String(created.course?.course_id),
        submittedBy: created.submittedBy?.id,
        status: created.status,
        createdAt: created.createdAt,
      };
    }

    return { sectionId: String(created.section_id) };
  }


  @Get('course/:courseId')
  @HttpCode(200)
  @Roles(SystemRole.TEACHER, SystemRole.ADMIN)
  async findAllByCourse(@Param('courseId') courseId: string, @Req() req: Request) {
    const user = (req as any).user;
    const ownerId = user?.id ?? null;
    const role = user?.role ?? null;

    const sections = await this.sectionService.findAllByCourse(courseId, ownerId, role);

    return sections.map(section => ({
      sectionId: String(section.section_id),
      title: section.title,
      description: section.description,
      orderIndex: section.order_index,
      isActive: section.is_active,
      createdAt: section.created_at,
      updatedAt: section.updated_at,
      contentsCount: section.contents?.length || 0,
    }));
  }


  @Get(':sectionId')
  @HttpCode(200)
  @Roles(SystemRole.TEACHER, SystemRole.ADMIN)
  async findOne(@Param('sectionId') sectionId: string, @Req() req: Request) {
    const ownerId = (req as any).user?.id ?? null;
    const section = await this.sectionService.findOne(sectionId, ownerId);

    const formattedContents = section.contents?.map(content => ({
      contentId: String(content.content_id),
      title: content.title,
      description: content.description,
      createdAt: content.created_at,
      filesCount: content.files?.length || 0,
    })) || [];

    return {
      sectionId: String(section.section_id),
      title: section.title,
      description: section.description,
      orderIndex: section.order_index,
      isActive: section.is_active,
      createdAt: section.created_at,
      updatedAt: section.updated_at,
      courseId: String(section.course_id),
      contents: formattedContents,
    };
  }

  @Patch(':sectionId')
  @HttpCode(200)
  @Roles(SystemRole.TEACHER, SystemRole.ADMIN)
  async update(
    @Param('sectionId') sectionId: string,
    @Body() dto: UpdateSectionDto,
    @Req() req: Request
  ) {
    const ownerId = (req as any).user?.id ?? null;
    const updated = await this.sectionService.update(sectionId, dto, ownerId);

    if ('id' in updated) {
      return {
        pendingId: String(updated.id),
        courseId: String(updated.course?.course_id),
        submittedBy: updated.submittedBy?.id,
        status: updated.status,
        updatedAt: updated.updatedAt,
      };
    }

    return { sectionId: String(updated.section_id) };
  }


  @Delete(':sectionId')
  @HttpCode(200)
  @Roles(SystemRole.TEACHER, SystemRole.ADMIN)
  async remove(@Param('sectionId') sectionId: string, @Req() req: Request) {
    const ownerId = (req as any).user?.id ?? null;
    await this.sectionService.remove(sectionId, ownerId);

    return null;
  }

  @Put('course/:courseId/reorder')
  @HttpCode(200)
  @Roles(SystemRole.TEACHER, SystemRole.ADMIN)
  async reorderSections(
    @Param('courseId') courseId: string,
    @Body() body: { sectionOrders: { sectionId: string; orderIndex: number }[] },
    @Req() req: Request
  ) {
    const ownerId = (req as any).user?.id ?? null;
    await this.sectionService.reorderSections(courseId, body.sectionOrders, ownerId);

    return null;
  }
}
