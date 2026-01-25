import { IsNotEmpty, IsString, IsOptional, MaxLength } from 'class-validator';
import { CreateContentFileDto } from './create-content-file.dto';

export class CreateContentDto {
  @IsString()
  @IsNotEmpty({ message: 'Tiêu đề nội dung không được để trống' })
  @MaxLength(255, { message: 'Tiêu đề nội dung không được quá 255 ký tự' })
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000, { message: 'Mô tả nội dung không được quá 5000 ký tự' })
  description?: string;

  @IsString()
  @IsNotEmpty({ message: 'Course ID không được để trống' })
  course_id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1, { message: 'Preview flag phải là Y hoặc N' })
  is_preview?: string;

  @IsOptional()
  @IsString()
  section_id?: string;

  @IsOptional()
  files?: CreateContentFileDto[];
}
