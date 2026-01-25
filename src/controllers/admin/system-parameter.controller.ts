import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  UseGuards,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/guards/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SystemRole } from '../../schema/entities/role.entity';
import { SystemParameterService } from '../../services/system-parameter.service';
import { CreateSystemParameterDto } from '../../schema/dtos/create-system-parameter.dto';
import { UpdateSystemParameterDto } from '../../schema/dtos/update-system-parameter.dto';
import { DeleteSystemParameterDto } from '../../schema/dtos/delete-system-parameter.dto';
import { GetSystemParametersDto } from '../../schema/dtos/get-system-parameters.dto';

@Controller('admin/system-parameters')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SystemParameterController {
  constructor(
    private readonly systemParameterService: SystemParameterService,
  ) {}

  @Get()
  @HttpCode(200)
  @Roles(SystemRole.ADMIN)
  async getAll(@Query() query: GetSystemParametersDto) {
    const result = await this.systemParameterService.getAll(query.page, query.limit);
    return {
      success: true,
      data: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    };
  }

  @Post()
  @HttpCode(201)
  @Roles(SystemRole.ADMIN)
  async create(@Body() createDto: CreateSystemParameterDto) {
    const result = await this.systemParameterService.createBulk(createDto.parameters);
    return {
      success: result.success.length > 0,
      data: {
        created: result.success,
        errors: result.errors,
      },
      message: `Tạo thành công ${result.success.length} tham số${result.errors.length > 0 ? `, ${result.errors.length} lỗi` : ''}`,
    };
  }

  @Post('update')
  @HttpCode(200)
  @Roles(SystemRole.ADMIN)
  async update(@Body() updateDto: UpdateSystemParameterDto) {
    const result = await this.systemParameterService.updateBulk(updateDto.parameters);
    return {
      success: result.success.length > 0,
      data: {
        updated: result.success,
        errors: result.errors,
      },
      message: `Cập nhật thành công ${result.success.length} tham số${result.errors.length > 0 ? `, ${result.errors.length} lỗi` : ''}`,
    };
  }

  @Post('delete')
  @HttpCode(200)
  @Roles(SystemRole.ADMIN)
  async delete(@Body() deleteDto: DeleteSystemParameterDto) {
    const result = await this.systemParameterService.deleteBulk(deleteDto.param_ids);
    return {
      success: result.success.length > 0,
      data: {
        deleted: result.success,
        errors: result.errors,
      },
      message: `Xóa thành công ${result.success.length} tham số${result.errors.length > 0 ? `, ${result.errors.length} lỗi` : ''}`,
    };
  }
}
