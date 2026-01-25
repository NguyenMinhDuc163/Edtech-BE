import { IsNotEmpty, IsString, IsOptional, IsEnum, MaxLength, IsUrl, IsInt, Min } from 'class-validator';
import { FileType } from '../entities/content-file.entity';

export class CreateContentFileDto {
  @IsString()
  @IsNotEmpty({ message: 'Tiêu đề file không được để trống' })
  @MaxLength(255, { message: 'Tiêu đề file không được quá 255 ký tự' })
  title!: string;

  @IsString()
  @IsNotEmpty({ message: 'Tên file không được để trống' })
  @MaxLength(255, { message: 'Tên file không được quá 255 ký tự' })
  filename!: string;

  @IsString()
  @IsNotEmpty({ message: 'URL không được để trống' })
  @MaxLength(1024, { message: 'URL không được quá 1024 ký tự' })
  @IsUrl({}, { message: 'URL không hợp lệ' })
  url!: string;

  @IsEnum(FileType, { message: 'Loại file phải là video, pdf, text, quiz, image, audio hoặc document' })
  file_type!: FileType;

  @IsOptional()
  @IsInt({ message: 'Kích thước file phải là số nguyên' })
  @Min(0, { message: 'Kích thước file phải lớn hơn hoặc bằng 0' })
  file_size?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'MIME type không được quá 100 ký tự' })
  mime_type?: string;

  @IsOptional()
  @IsInt({ message: 'Thứ tự phải là số nguyên' })
  @Min(1, { message: 'Thứ tự phải lớn hơn 0' })
  order_index?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1, { message: 'Preview flag phải là Y hoặc N' })
  is_preview?: string;
}
