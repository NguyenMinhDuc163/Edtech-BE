import {
  Controller,
  Body,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "src/common/guards/jwt-auth.guard";
import { Roles } from "src/common/guards/roles.decorator";
import { RolesGuard } from "src/common/guards/roles.guard";
import { AdminGetCoursesDto } from "src/schema/dtos/admin-get-courses.dto";
import { SystemRole } from "src/schema/entities/role.entity";
import { CourseService } from "src/services/course.service";
import { Response } from "express";
import { IapPurchaseService } from "src/services/iap-purchase.service";
import {
  CreateCourseStoreProductDto,
  UpdateCourseMobileIapDto,
  UpdateCourseStoreProductDto,
} from "src/schema/dtos/mobile-iap.dto";

@Controller("admin/courses")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminCourseController {
  constructor(
    private readonly courseService: CourseService,
    private readonly iapPurchaseService: IapPurchaseService,
  ) {}

  @Get()
  @HttpCode(200)
  @Roles(SystemRole.ADMIN)
  async getCoursesByAdmin(@Query() query: AdminGetCoursesDto) {
    return this.courseService.getAdminCourses(query);
  }

  @Get(":courseId/store-products")
  @HttpCode(200)
  @Roles(SystemRole.ADMIN)
  async getStoreProducts(@Param("courseId") courseId: string) {
    return this.iapPurchaseService.listCourseProducts(courseId);
  }

  @Post(":courseId/store-products")
  @HttpCode(201)
  @Roles(SystemRole.ADMIN)
  async createStoreProduct(
    @Param("courseId") courseId: string,
    @Body() dto: CreateCourseStoreProductDto,
  ) {
    return this.iapPurchaseService.createCourseProduct(courseId, dto);
  }

  @Patch(":courseId/store-products/:productId")
  @HttpCode(200)
  @Roles(SystemRole.ADMIN)
  async updateStoreProduct(
    @Param("courseId") courseId: string,
    @Param("productId") productId: string,
    @Body() dto: UpdateCourseStoreProductDto,
  ) {
    return this.iapPurchaseService.updateCourseProduct(courseId, productId, dto);
  }

  @Patch(":courseId/mobile-iap")
  @HttpCode(200)
  @Roles(SystemRole.ADMIN)
  async updateMobileIap(
    @Param("courseId") courseId: string,
    @Body() dto: UpdateCourseMobileIapDto,
  ) {
    return this.iapPurchaseService.updateCourseMobileIap(
      courseId,
      dto.mobileIapEnabled,
      dto.isPaid,
    );
  }

  @Get(":courseId/export")
  @Roles(SystemRole.ADMIN)
  async exportCourseReport(
    @Param("courseId") courseId: string,
    @Res() res: Response
  ) {
    const buffer = await this.courseService.exportAdminCourseReport(courseId);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="course_${courseId}_report.xlsx"`
    );
    res.send(buffer);
  }
}
