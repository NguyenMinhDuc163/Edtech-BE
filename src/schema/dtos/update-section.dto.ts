import { IsOptional, IsString, IsInt, Min, MaxLength, IsBoolean } from 'class-validator';

export class UpdateSectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Tiêu đề section không được quá 255 ký tự' })
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000, { message: 'Mô tả section không được quá 5000 ký tự' })
  description?: string;

  @IsOptional()
  @IsInt({ message: 'Thứ tự phải là số nguyên' })
  @Min(1, { message: 'Thứ tự phải lớn hơn 0' })
  order_index?: number;

  @IsOptional()
  @IsBoolean({ message: 'Trạng thái active phải là boolean' })
  is_active?: boolean;
}
