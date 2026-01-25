import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "src/common/guards/jwt-auth.guard";
import { Roles } from "src/common/guards/roles.decorator";
import { RolesGuard } from "src/common/guards/roles.guard";
import { AdminDashboardQueryDto } from "src/schema/dtos/admin-dashboard.dto";
import { SystemRole } from "src/schema/entities/role.entity";
import { AdminDashboardService } from "src/services/admin-dashboard.service";

@Controller("admin/dashboard")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(SystemRole.ADMIN)
export class AdminDashboardController {
  constructor(private readonly service: AdminDashboardService) { }

  @Get("overview")
  async getStats(@Query() query: AdminDashboardQueryDto) {
    const stats = await this.service.getOverview(query);
    return stats;
  }

  @Get("detail")
  async getDetails(@Query() query: AdminDashboardQueryDto) {
    const stats = await this.service.getDetails(query);
    return stats;
  }

  @Get("exams")
  async getExamStats(@Query() query: AdminDashboardQueryDto) {
    const stats = await this.service.getExamStats(query);
    return stats;
  }
}
