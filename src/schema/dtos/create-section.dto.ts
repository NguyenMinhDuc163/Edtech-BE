import { IsNotEmpty, IsString, IsOptional, IsInt, Min, MaxLength } from 'class-validator';

export class CreateSectionDto {
  @IsString()
  @IsNotEmpty({ message: 'Tiêu đề section không được để trống' })
  @MaxLength(255, { message: 'Tiêu đề section không được quá 255 ký tự' })
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000, { message: 'Mô tả section không được quá 5000 ký tự' })
  description?: string;

  @IsOptional()
  @IsInt({ message: 'Thứ tự phải là số nguyên' })
  @Min(1, { message: 'Thứ tự phải lớn hơn 0' })
  order_index?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1, { message: 'Preview flag phải là Y hoặc N' })
  is_preview?: string;

  @IsString()
  @IsNotEmpty({ message: 'Course ID không được để trống' })
  course_id!: string;
}
