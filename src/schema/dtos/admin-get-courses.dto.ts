import { IsNumber, IsOptional, IsString } from "class-validator";
import { CourseStatus, CourseVisibility } from "../entities/course.entity";
import { Type } from "class-transformer";

export class AdminGetCoursesDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  status?: CourseStatus;

  @IsOptional()
  @IsString()
  visibility?: CourseVisibility;
}
