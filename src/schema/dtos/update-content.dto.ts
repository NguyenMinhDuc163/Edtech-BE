import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CreateContentFileDto } from './create-content-file.dto';

export class UpdateContentDto {
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Tiêu đề nội dung không được quá 255 ký tự' })
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000, { message: 'Mô tả nội dung không được quá 5000 ký tự' })
  description?: string;

  @IsOptional()
  @IsString()
  section_id?: string;

  @IsOptional()
  files?: CreateContentFileDto[];
}
