import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';

export class SystemParameterItemDto {
  @IsString()
  @IsNotEmpty({ message: 'Khóa tham số không được để trống' })
  @MinLength(1, { message: 'Khóa tham số phải có ít nhất 1 ký tự' })
  @MaxLength(100, { message: 'Khóa tham số không được vượt quá 100 ký tự' })
  param_key!: string;

  @IsString()
  @IsOptional()
  @MaxLength(255, { message: 'Giá trị tham số không được vượt quá 255 ký tự' })
  param_value?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100, { message: 'Tên function không được vượt quá 100 ký tự' })
  function_name?: string;
}

export class CreateSystemParameterDto {
  @IsArray({ message: 'Parameters phải là một mảng' })
  @ValidateNested({ each: true })
  @Type(() => SystemParameterItemDto)
  parameters!: SystemParameterItemDto[];
}
